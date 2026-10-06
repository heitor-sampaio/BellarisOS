-- O "entrar como" ENTRE ORIGENS (2026-10-06).
--
-- O painel do suporte mora num host (suporte.bellarisos.com) e a conta do
-- membro na clínica (app.bellarisos.com): a sessão do membro tem de nascer
-- com cookie DA CLÍNICA, e a do atendente nunca pode ir para lá. A ponte é um
-- CÓDIGO de uso único: o painel abre a sessão de suporte (`abrindo`) e cria o
-- código; a aba nova o leva no corpo de um POST à clínica, que o consome e só
-- então gera a sessão do Auth do membro (`suporte_sessao_ativar`).
--
-- Só o SHA-256 do código fica aqui; ele vale 60 s e UMA vez (o consumo é um
-- update condicional, atômico). RLS ligada e ZERO políticas: só o servidor
-- (service role) lê e escreve — como as credenciais.

create table if not exists public.support_entry_codes (
  hash        text primary key,
  sessao_id   uuid not null references public.support_sessions(id) on delete cascade,
  expira_em   timestamptz not null,
  usado_em    timestamptz,
  criado_em   timestamptz not null default now()
);
alter table public.support_entry_codes enable row level security;
create index if not exists support_entry_codes_sessao on public.support_entry_codes (sessao_id);

-- Cria o código de uma sessão que está ABRINDO (60 s).
create or replace function public.suporte_entrada_criar(p_sessao uuid, p_hash text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_hash is null or length(p_hash) <> 64 then raise exception 'Código inválido.'; end if;
  if not exists (select 1 from public.support_sessions where id = p_sessao and status = 'abrindo') then
    raise exception 'Sessão de suporte não está abrindo.';
  end if;
  insert into public.support_entry_codes (hash, sessao_id, expira_em) values (p_hash, p_sessao, now() + interval '60 seconds');
end $$;

-- Consome o código: UMA vez, dentro do prazo, e só de sessão ainda abrindo.
-- Devolve a sessão, ou nulo (usado, vencido, inexistente).
create or replace function public.suporte_entrada_consumir(p_hash text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_sessao uuid;
begin
  update public.support_entry_codes c set usado_em = now()
   where c.hash = p_hash and c.usado_em is null and c.expira_em > now()
     and exists (select 1 from public.support_sessions s where s.id = c.sessao_id and s.status = 'abrindo')
  returning c.sessao_id into v_sessao;
  return v_sessao;
end $$;

-- A sessão que ficou ABRINDO (código nunca usado) fecha em 2 minutos (era 5):
-- ela trava novas entradas do mesmo atendente e na mesma conta.
create or replace function public.suporte_encerrar_vencidas()
returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare v_s record; v_ids uuid[] := '{}';
begin
  for v_s in select id, auth_session_id from public.support_sessions
              where (status = 'ativa' and expires_at <= now())
                 or (status = 'abrindo' and started_at < now() - interval '2 minutes')
              for update skip locked loop
    perform public.suporte_sessao_encerrar(v_s.id, 'venceu');
    if v_s.auth_session_id is not null then v_ids := v_ids || v_s.auth_session_id; end if;
  end loop;
  return v_ids;
end $$;

revoke execute on function public.suporte_entrada_criar(uuid, text) from public, anon, authenticated;
revoke execute on function public.suporte_entrada_consumir(text) from public, anon, authenticated;
revoke execute on function public.suporte_encerrar_vencidas() from public, anon, authenticated;
grant execute on function public.suporte_entrada_criar(uuid, text) to service_role;
grant execute on function public.suporte_entrada_consumir(text) to service_role;
grant execute on function public.suporte_encerrar_vencidas() to service_role;

notify pgrst, 'reload schema';
