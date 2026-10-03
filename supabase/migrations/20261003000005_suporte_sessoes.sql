-- Suporte com impersonificação autorizada (fase 2, 2026-10-03).
--
-- O atendente da plataforma entra na conta de um membro de uma rede com uma
-- SESSÃO REAL do Auth daquele membro — parte do app (a agenda, os cargos, todo
-- o Realtime) fala com o banco pelo token do usuário, então trocar só o
-- contexto do servidor não funcionaria. Essa sessão fica marcada aqui, por
-- `auth_session_id` (o `session_id` do JWT), e é por ela que o servidor e a
-- RLS sabem que é o suporte — sem depender do hook de token (que existe abaixo
-- como endurecimento opcional, ligado no painel do Supabase).
--
-- Regras (decisões do Heitor):
--   - só com AUTORIZAÇÃO vigente da clínica (`support_grants`), temporária;
--   - dado clínico bloqueado, salvo autorização que o inclua — na RLS também
--     (políticas RESTRICTIVE abaixo), porque o token está no navegador;
--   - tudo registrado (`support_access_log`, só acrescenta).
--
-- Tabelas como credencial: RLS ligada e ZERO políticas; funções do servidor
-- fechadas à sessão.

-- --- Autorizações ---------------------------------------------------------
create table if not exists public.support_grants (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  target_user_id       uuid not null references public.users(id) on delete cascade,
  granted_by_user_id   uuid references public.users(id) on delete set null,
  via                  text not null check (via in ('chamado', 'configuracoes')),
  ticket_id            uuid,
  includes_clinical    boolean not null default false,
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  revoked_at           timestamptz,
  revoked_by_user_id   uuid references public.users(id) on delete set null,
  revoked_by_staff_id  uuid references public.platform_staff(id),
  motivo_revogacao     text
);
alter table public.support_grants enable row level security;
-- Uma por pessoa: autorizar de novo substitui a anterior (a função revoga).
create unique index if not exists support_grants_uma_por_pessoa
  on public.support_grants (target_user_id) where revoked_at is null;
create index if not exists support_grants_tenant on public.support_grants (tenant_id, created_at desc);

-- --- Sessões --------------------------------------------------------------
create table if not exists public.support_sessions (
  id                 uuid primary key default gen_random_uuid(),
  grant_id           uuid not null references public.support_grants(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  target_user_id     uuid not null references public.users(id) on delete cascade,
  target_auth_id     uuid not null,
  staff_id           uuid not null references public.platform_staff(id),
  ticket_id          uuid,
  motivo             text not null check (length(trim(motivo)) >= 3),
  includes_clinical  boolean not null,
  auth_session_id    uuid unique,
  status             text not null default 'abrindo'
                     check (status in ('abrindo', 'ativa', 'encerrada', 'falhou')),
  started_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  ended_at           timestamptz,
  end_reason         text,
  ip                 text,
  user_agent         text
);
alter table public.support_sessions enable row level security;
create unique index if not exists support_sessions_uma_por_atendente
  on public.support_sessions (staff_id) where status in ('abrindo', 'ativa');
create unique index if not exists support_sessions_uma_por_alvo
  on public.support_sessions (target_user_id) where status in ('abrindo', 'ativa');
create index if not exists support_sessions_tenant on public.support_sessions (tenant_id, started_at desc);

-- --- O que foi feito na sessão (só acrescenta) ----------------------------
create table if not exists public.support_access_log (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.support_sessions(id) on delete cascade,
  at          timestamptz not null default now(),
  method      text,
  path        text,
  action_id   text,
  ip          text
);
alter table public.support_access_log enable row level security;
create index if not exists support_access_log_sessao on public.support_access_log (session_id, at);

create or replace function private.support_access_log_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'O registro de acesso do suporte não se altera.';
end $$;
drop trigger if exists trg_support_access_log_imutavel on public.support_access_log;
create trigger trg_support_access_log_imutavel
  before update on public.support_access_log
  for each row execute function private.support_access_log_imutavel();

-- O evento de domínio diz se veio de uma sessão de suporte.
alter table public.domain_events add column if not exists suporte_sessao_id uuid;
create index if not exists domain_events_suporte_sessao on public.domain_events (suporte_sessao_id)
  where suporte_sessao_id is not null;

-- --- Funções do servidor ---------------------------------------------------

-- Autoriza (ou re-autoriza) o suporte a entrar na conta de um membro. Quem pode
-- autorizar quem é regra do app (lib/suporte/regras.ts); aqui, a mesma rede e o
-- membro ativo, e a anterior substituída numa transação.
create or replace function public.suporte_autorizar(
  p_tenant uuid, p_target uuid, p_por uuid, p_via text, p_ticket uuid,
  p_clinico boolean, p_horas int
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if p_horas not in (24, 72, 168) then raise exception 'Duração de autorização inválida.'; end if;
  if not exists (select 1 from public.users where id = p_target and tenant_id = p_tenant and is_active) then
    raise exception 'Membro não encontrado nesta rede.';
  end if;
  if p_por is not null and not exists (select 1 from public.users where id = p_por and tenant_id = p_tenant) then
    raise exception 'Quem autoriza não é desta rede.';
  end if;
  update public.support_grants
     set revoked_at = now(), revoked_by_user_id = p_por, motivo_revogacao = 'substituída'
   where target_user_id = p_target and revoked_at is null;
  insert into public.support_grants
    (tenant_id, target_user_id, granted_by_user_id, via, ticket_id, includes_clinical, expires_at)
  values
    (p_tenant, p_target, p_por, p_via, p_ticket, coalesce(p_clinico, false), now() + make_interval(hours => p_horas))
  returning id into v_id;
  return v_id;
end $$;

-- Encerra uma sessão e derruba a sessão do Auth (o refresh token some junto).
create or replace function public.suporte_sessao_encerrar(p_sessao uuid, p_motivo text, p_falhou boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_auth uuid;
begin
  update public.support_sessions
     set status = case when p_falhou then 'falhou' else 'encerrada' end,
         ended_at = now(), end_reason = left(coalesce(p_motivo, 'encerrada'), 200)
   where id = p_sessao and status in ('abrindo', 'ativa')
  returning auth_session_id into v_auth;
  if v_auth is not null then delete from auth.sessions where id = v_auth; end if;
  return v_auth;
end $$;

-- Revoga uma autorização: as sessões dela caem na hora.
create or replace function public.suporte_revogar_autorizacao(
  p_grant uuid, p_tenant uuid, p_por_user uuid, p_por_staff uuid, p_motivo text
) returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare v_s record; v_ids uuid[] := '{}';
begin
  update public.support_grants
     set revoked_at = now(), revoked_by_user_id = p_por_user, revoked_by_staff_id = p_por_staff,
         motivo_revogacao = left(coalesce(p_motivo, 'revogada'), 200)
   where id = p_grant and tenant_id = p_tenant and revoked_at is null;
  if not found then raise exception 'Autorização não encontrada.'; end if;
  for v_s in select id, auth_session_id from public.support_sessions
              where grant_id = p_grant and status in ('abrindo', 'ativa') loop
    perform public.suporte_sessao_encerrar(v_s.id, 'autorização revogada');
    if v_s.auth_session_id is not null then v_ids := v_ids || v_s.auth_session_id; end if;
  end loop;
  return v_ids;
end $$;

-- Fecha as sessões vencidas (o cron, e antes de abrir uma nova).
create or replace function public.suporte_encerrar_vencidas()
returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare v_s record; v_ids uuid[] := '{}';
begin
  for v_s in select id, auth_session_id from public.support_sessions
              where (status = 'ativa' and expires_at <= now())
                 or (status = 'abrindo' and started_at < now() - interval '5 minutes')
              for update skip locked loop
    perform public.suporte_sessao_encerrar(v_s.id, 'venceu');
    if v_s.auth_session_id is not null then v_ids := v_ids || v_s.auth_session_id; end if;
  end loop;
  return v_ids;
end $$;

-- Abre a sessão (ainda sem a do Auth): autorização vigente, atendente ativo,
-- uma por atendente e uma por alvo. Prazo: 60 min, nunca além da autorização.
create or replace function public.suporte_sessao_abrir(
  p_tenant uuid, p_target uuid, p_staff uuid, p_ticket uuid, p_motivo text, p_ip text, p_ua text
) returns table (sessao_id uuid, expira_em timestamptz, inclui_clinico boolean, target_auth uuid)
language plpgsql security definer set search_path = public
as $$
declare v_g record; v_u record; v_id uuid; v_exp timestamptz;
begin
  perform public.suporte_encerrar_vencidas();
  if not exists (select 1 from public.platform_staff where id = p_staff and is_active) then
    raise exception 'Atendente inativo.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Diga o motivo do acesso.'; end if;
  select * into v_g from public.support_grants
   where target_user_id = p_target and tenant_id = p_tenant and revoked_at is null and expires_at > now();
  if not found then raise exception 'Sem autorização vigente da clínica para acessar esta conta.'; end if;
  select id, auth_id, is_active into v_u from public.users where id = p_target and tenant_id = p_tenant;
  if not found or not v_u.is_active or v_u.auth_id is null then raise exception 'Membro inativo ou sem login.'; end if;
  v_exp := least(now() + interval '60 minutes', v_g.expires_at);
  begin
    insert into public.support_sessions
      (grant_id, tenant_id, target_user_id, target_auth_id, staff_id, ticket_id, motivo, includes_clinical, expires_at, ip, user_agent)
    values
      (v_g.id, p_tenant, p_target, v_u.auth_id::uuid, p_staff, coalesce(p_ticket, v_g.ticket_id), trim(p_motivo),
       v_g.includes_clinical, v_exp, left(p_ip, 80), left(p_ua, 300))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Já existe uma sessão de suporte aberta (sua, ou nesta conta).';
  end;
  return query select v_id, v_exp, v_g.includes_clinical, v_u.auth_id::uuid;
end $$;

-- Liga a sessão do Auth recém-criada à de suporte, e põe nela o prazo
-- (`not_after`: depois disso o Auth não renova o token).
create or replace function public.suporte_sessao_ativar(p_sessao uuid, p_auth_session uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_exp timestamptz;
begin
  update public.support_sessions set status = 'ativa', auth_session_id = p_auth_session
   where id = p_sessao and status = 'abrindo'
  returning expires_at into v_exp;
  if v_exp is null then raise exception 'Sessão de suporte não está abrindo.'; end if;
  update auth.sessions set not_after = v_exp where id = p_auth_session;
end $$;

-- Derruba uma sessão do Auth (a entrada que falhou no meio).
create or replace function public.plataforma_encerrar_sessao_do_auth(p_auth_session uuid)
returns void
language sql security definer set search_path = public
as $ delete from auth.sessions where id = p_auth_session $;
revoke execute on function public.plataforma_encerrar_sessao_do_auth(uuid) from public, anon, authenticated;
grant execute on function public.plataforma_encerrar_sessao_do_auth(uuid) to service_role;

revoke execute on function public.suporte_autorizar(uuid, uuid, uuid, text, uuid, boolean, int) from public, anon, authenticated;
revoke execute on function public.suporte_sessao_encerrar(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.suporte_revogar_autorizacao(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.suporte_encerrar_vencidas() from public, anon, authenticated;
revoke execute on function public.suporte_sessao_abrir(uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.suporte_sessao_ativar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.suporte_autorizar(uuid, uuid, uuid, text, uuid, boolean, int) to service_role;
grant execute on function public.suporte_sessao_encerrar(uuid, text, boolean) to service_role;
grant execute on function public.suporte_revogar_autorizacao(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.suporte_encerrar_vencidas() to service_role;
grant execute on function public.suporte_sessao_abrir(uuid, uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.suporte_sessao_ativar(uuid, uuid) to service_role;

-- --- RLS: o que o token de uma sessão de suporte alcança --------------------

-- A sessão deste token é de suporte e já ACABOU (encerrada, revogada, vencida)?
-- O servidor já a barra (buildContext); isto barra o resto da hora de vida do
-- access token no PostgREST e no Realtime.
create or replace function private.suporte_encerrada()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.support_sessions s
    where s.auth_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and (s.status <> 'ativa' or s.expires_at <= now()))
$$;

-- A sessão deste token é de suporte SEM dado clínico autorizado?
create or replace function private.suporte_sem_clinico()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.support_sessions s
    where s.auth_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and not s.includes_clinical)
$$;

-- Sessão de suporte que acabou deixa de ter rede: todas as políticas que
-- comparam `jwt_claim` negam.
create or replace function public.jwt_claim(claim text)
returns text
language sql stable
set search_path to ''
as $$
  select case when private.suporte_encerrada() then null
              else auth.jwt() -> 'app_metadata' ->> claim end;
$$;

-- Dado clínico: política RESTRICTIVE (soma-se por AND às que existem).
do $$
declare t text;
begin
  foreach t in array array['medical_records', 'medical_record_entries', 'record_photos', 'anamnesis_data',
                           'consent_terms', 'injectable_maps', 'injectable_applications'] loop
    execute format('drop policy if exists suporte_sem_clinico on public.%I', t);
    execute format(
      'create policy suporte_sem_clinico on public.%I as restrictive for all
         using (not private.suporte_sem_clinico()) with check (not private.suporte_sem_clinico())', t);
  end loop;
end $$;

-- Os anexos clínicos do cliente também (o nome do arquivo já diz muito).
drop policy if exists suporte_sem_clinico on public.client_documents;
create policy suporte_sem_clinico on public.client_documents as restrictive for all
  using (not (private.suporte_sem_clinico()
              and category in ('termo_consentimento', 'exame', 'laudo', 'foto_clinica', 'receita')))
  with check (not (private.suporte_sem_clinico()
              and category in ('termo_consentimento', 'exame', 'laudo', 'foto_clinica', 'receita')));

-- --- Credenciais do alvo não mudam durante a sessão de suporte --------------
-- O GoTrue aceita trocar senha e e-mail só com o token (PUT /auth/v1/user):
-- barrar na action não basta. Vale enquanto houver sessão de suporte vigente
-- naquela conta (também para o próprio dono — no máximo 60 min).
create or replace function private.suporte_trava_usuario()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.encrypted_password is distinct from old.encrypted_password
      or new.email is distinct from old.email
      or new.email_change is distinct from old.email_change
      or new.phone is distinct from old.phone)
     and exists (select 1 from public.support_sessions s
                  where s.target_auth_id = new.id and s.status = 'ativa' and s.expires_at > now()) then
    raise exception 'Durante o acesso do suporte, senha, e-mail e telefone desta conta não mudam.';
  end if;
  return new;
end $$;
drop trigger if exists trg_suporte_trava_usuario on auth.users;
create trigger trg_suporte_trava_usuario before update on auth.users
  for each row execute function private.suporte_trava_usuario();

create or replace function private.suporte_trava_fator()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := coalesce(new.user_id, old.user_id);
begin
  if exists (select 1 from public.support_sessions s
              where s.target_auth_id = v_user and s.status = 'ativa' and s.expires_at > now()) then
    raise exception 'Durante o acesso do suporte, os fatores de acesso desta conta não mudam.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_suporte_trava_fator on auth.mfa_factors;
create trigger trg_suporte_trava_fator before insert or delete on auth.mfa_factors
  for each row execute function private.suporte_trava_fator();
drop trigger if exists trg_suporte_trava_identidade on auth.identities;
create trigger trg_suporte_trava_identidade before insert on auth.identities
  for each row execute function private.suporte_trava_fator();

-- --- Hook de token (opcional; ligar no painel: Auth → Hooks → Custom Access Token)
-- Com ele, o token da sessão de suporte carrega `suporte: {s, c}` e o Auth
-- RECUSA renovar o token de uma sessão encerrada ou vencida. Sem ele, tudo
-- acima continua valendo (a sessão é achada pelo `session_id`). Falha de
-- qualquer tipo devolve o evento intacto: o hook nunca impede um login.
create or replace function public.suporte_hook_do_token(event jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_sid uuid; v_s record;
begin
  v_sid := nullif(event -> 'claims' ->> 'session_id', '')::uuid;
  if v_sid is null then return event; end if;
  select id, status, expires_at, includes_clinical into v_s
    from public.support_sessions where auth_session_id = v_sid;
  if not found then return event; end if;
  if v_s.status <> 'ativa' or v_s.expires_at <= now() then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Sessão de suporte encerrada.'));
  end if;
  return jsonb_set(event, '{claims,suporte}', jsonb_build_object('s', v_s.id, 'c', v_s.includes_clinical));
exception when others then
  return event;
end $$;
revoke execute on function public.suporte_hook_do_token(jsonb) from public, anon, authenticated;
grant execute on function public.suporte_hook_do_token(jsonb) to supabase_auth_admin;

notify pgrst, 'reload schema';
