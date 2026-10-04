-- Suporte: o que a verificação das fases 1 e 2 achou (2026-10-03).
--
-- 1. CUSTO do jwt_claim. Ele passou a consultar `support_sessions` a cada
--    chamada (~140 µs, contra ~1,6 µs da expressão de antes), e as políticas o
--    chamam por linha. O estado da sessão de suporte agora é lido UMA vez por
--    transação e guardado num GUC local (`bellaris.suporte`, chaveado pelo
--    session_id do token): as chamadas seguintes leem a memória.
--    De brinde, `jwt_claim` vira security definer: o `anon` (sem uso do schema
--    private) voltava 42501 em vez de nada.
-- 2. Autorização SUBSTITUÍDA (a clínica re-autoriza) não derrubava a sessão
--    em curso, que seguia com o retrato antigo (inclusive o dado clínico). Um
--    gatilho encerra as sessões de toda autorização revogada — por qualquer
--    porta: revogar, substituir, desativar o membro.
-- 3. `push_tokens` e `user_notifications` conferem `auth.uid()`, não
--    `jwt_claim`: o atendente registrava o aparelho DELE na conta do membro e
--    seguia recebendo o sino depois de sair. Política RESTRITIVA: sessão de
--    suporte não mexe em aparelho; sessão encerrada não lê o sino.
-- 4. A trava de credencial passa a cobrir `phone_change`.

-- 1. O estado da sessão de suporte desta requisição -------------------------
--    '' = não é sessão de suporte; senão duas letras: a|e (ativa e vigente |
--    encerrada ou vencida) + c|s (com | sem dado clínico).
create or replace function private.suporte_estado()
returns text language plpgsql stable security definer set search_path = ''
as $$
declare
  v_sid   text := nullif(auth.jwt() ->> 'session_id', '');
  v_cache text;
  v_est   text;
begin
  if v_sid is null then return ''; end if;
  v_cache := current_setting('bellaris.suporte', true);
  if v_cache is not null and v_cache like v_sid || ':%' then
    return substr(v_cache, length(v_sid) + 2);
  end if;
  select (case when s.status = 'ativa' and s.expires_at > now() then 'a' else 'e' end)
      || (case when s.includes_clinical then 'c' else 's' end)
    into v_est
    from public.support_sessions s
   where s.auth_session_id = v_sid::uuid;
  v_est := coalesce(v_est, '');
  perform set_config('bellaris.suporte', v_sid || ':' || v_est, true);
  return v_est;
end $$;

create or replace function private.suporte_encerrada()
returns boolean language sql stable security definer set search_path = ''
as $$ select left(private.suporte_estado(), 1) = 'e' $$;

create or replace function private.suporte_sem_clinico()
returns boolean language sql stable security definer set search_path = ''
as $$ select right(private.suporte_estado(), 1) = 's' $$;

create or replace function private.em_suporte()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.suporte_estado() <> '' $$;

create or replace function public.jwt_claim(claim text)
returns text language sql stable security definer set search_path = ''
as $$
  select case when private.suporte_encerrada() then null
              else auth.jwt() -> 'app_metadata' ->> claim end;
$$;

-- 2. Autorização revogada (ou substituída) encerra as sessões dela ----------
create or replace function private.suporte_autorizacao_revogada()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_s record;
begin
  for v_s in select id from public.support_sessions
              where grant_id = new.id and status in ('abrindo', 'ativa') loop
    perform public.suporte_sessao_encerrar(v_s.id,
      case when new.motivo_revogacao = 'substituída' then 'autorização substituída' else 'autorização revogada' end);
  end loop;
  return new;
end $$;

drop trigger if exists trg_autorizacao_revogada_encerra on public.support_grants;
create trigger trg_autorizacao_revogada_encerra after update of revoked_at on public.support_grants
  for each row when (old.revoked_at is null and new.revoked_at is not null)
  execute function private.suporte_autorizacao_revogada();

-- A revogação devolve as sessões que derrubou (para o app expirar o cache):
-- lidas ANTES, porque o gatilho as encerra junto com o update.
create or replace function public.suporte_revogar_autorizacao(
  p_grant uuid, p_tenant uuid, p_por_user uuid, p_por_staff uuid, p_motivo text
) returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(auth_session_id) filter (where auth_session_id is not null), '{}')
    into v_ids
    from public.support_sessions
   where grant_id = p_grant and status in ('abrindo', 'ativa');
  update public.support_grants
     set revoked_at = now(), revoked_by_user_id = p_por_user, revoked_by_staff_id = p_por_staff,
         motivo_revogacao = left(coalesce(p_motivo, 'revogada'), 200)
   where id = p_grant and tenant_id = p_tenant and revoked_at is null;
  if not found then raise exception 'Autorização não encontrada.'; end if;
  return v_ids;
end $$;
revoke execute on function public.suporte_revogar_autorizacao(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.suporte_revogar_autorizacao(uuid, uuid, uuid, uuid, text) to service_role;

-- 3. Aparelho e sino fora do suporte -----------------------------------------
drop policy if exists push_tokens_fora_do_suporte on public.push_tokens;
create policy push_tokens_fora_do_suporte on public.push_tokens as restrictive for all
  using (not private.em_suporte()) with check (not private.em_suporte());

drop policy if exists user_notifications_fora_do_suporte_encerrado on public.user_notifications;
create policy user_notifications_fora_do_suporte_encerrado on public.user_notifications as restrictive for all
  using (not private.suporte_encerrada()) with check (not private.suporte_encerrada());

-- 4. Telefone na trava de credencial -----------------------------------------
create or replace function private.suporte_trava_usuario()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.encrypted_password is distinct from old.encrypted_password
      or new.email is distinct from old.email
      or new.email_change is distinct from old.email_change
      or new.phone is distinct from old.phone
      or new.phone_change is distinct from old.phone_change)
     and exists (select 1 from public.support_sessions s
                  where s.target_auth_id = new.id and s.status = 'ativa' and s.expires_at > now()) then
    raise exception 'Durante o acesso do suporte, senha, e-mail e telefone desta conta não mudam.';
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
