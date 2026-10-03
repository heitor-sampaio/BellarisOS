-- Chamados de suporte (fase 3, 2026-10-03).
--
-- A clínica pede ajuda pelo botão "Ajuda" da topbar; o chamado leva o
-- contexto (tela, aparelho, quem, unidade) e pode já AUTORIZAR o suporte a
-- entrar na conta de quem abriu. No /suporte vira fila com conversa.
--
-- Tabelas como credencial: RLS ligada e ZERO políticas (só o servidor). A
-- exceção é `support_signals`: uma linha sem dado nenhum, que a plataforma
-- assina pelo Realtime para saber que a fila mudou (o padrão de
-- `crm_quadro_sinais`, §4) — e a única política dela é a leitura por quem tem
-- a marca da plataforma.

create table if not exists public.support_tickets (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint generated always as identity unique,
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  branch_id            uuid references public.branches(id) on delete set null,
  opened_by_user_id    uuid references public.users(id) on delete set null,
  assunto              text not null check (length(trim(assunto)) between 3 and 120),
  status               text not null default 'aberto'
                       check (status in ('aberto', 'em_andamento', 'aguardando_clinica', 'resolvido')),
  contexto             jsonb not null default '{}'::jsonb,
  assigned_staff_id    uuid references public.platform_staff(id) on delete set null,
  grant_id             uuid references public.support_grants(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  last_message_at      timestamptz not null default now(),
  last_staff_reply_at  timestamptz,
  resolved_at          timestamptz
);
alter table public.support_tickets enable row level security;
create index if not exists support_tickets_fila on public.support_tickets (status, last_message_at desc);
create index if not exists support_tickets_rede on public.support_tickets (tenant_id, created_at desc);
create index if not exists support_tickets_quem on public.support_tickets (opened_by_user_id, last_message_at desc);

create table if not exists public.support_ticket_messages (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null references public.support_tickets(id) on delete cascade,
  author_kind      text not null check (author_kind in ('usuario', 'suporte', 'sistema')),
  author_user_id   uuid references public.users(id) on delete set null,
  author_staff_id  uuid references public.platform_staff(id) on delete set null,
  body             text not null check (length(trim(body)) between 1 and 5000),
  anexos           jsonb not null default '[]'::jsonb,
  -- Nota interna da equipe do suporte: a clínica não vê.
  interna          boolean not null default false,
  created_at       timestamptz not null default now()
);
alter table public.support_ticket_messages enable row level security;
create index if not exists support_ticket_messages_conversa on public.support_ticket_messages (ticket_id, created_at);

-- O chamado de onde vieram a autorização e a sessão.
alter table public.support_grants
  drop constraint if exists support_grants_ticket_id_fkey,
  add constraint support_grants_ticket_id_fkey foreign key (ticket_id) references public.support_tickets(id) on delete set null;
alter table public.support_sessions
  drop constraint if exists support_sessions_ticket_id_fkey,
  add constraint support_sessions_ticket_id_fkey foreign key (ticket_id) references public.support_tickets(id) on delete set null;

-- O sinal da fila: uma linha, sem dado. A plataforma assina e recarrega pelo servidor.
create table if not exists public.support_signals (
  id          int primary key default 1 check (id = 1),
  updated_at  timestamptz not null default now()
);
alter table public.support_signals enable row level security;
insert into public.support_signals (id) values (1) on conflict (id) do nothing;
drop policy if exists support_signals_plataforma on public.support_signals;
create policy support_signals_plataforma on public.support_signals for select
  using (public.jwt_claim('plataforma') is not null);
do $$ begin
  alter publication supabase_realtime add table public.support_signals;
exception when duplicate_object then null; end $$;

-- Abre o chamado: o chamado, a primeira mensagem, a autorização (se pedida) e
-- o sinal, numa transação.
create or replace function public.chamado_abrir(
  p_tenant uuid, p_branch uuid, p_user uuid, p_assunto text, p_corpo text,
  p_contexto jsonb, p_anexos jsonb, p_autorizar boolean, p_clinico boolean, p_horas int
) returns table (chamado_id uuid, numero bigint)
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_num bigint; v_grant uuid;
begin
  if not exists (select 1 from public.users where id = p_user and tenant_id = p_tenant and is_active) then
    raise exception 'Quem abre o chamado não é desta rede.';
  end if;
  insert into public.support_tickets (tenant_id, branch_id, opened_by_user_id, assunto, contexto)
  values (p_tenant, p_branch, p_user, trim(p_assunto), coalesce(p_contexto, '{}'::jsonb))
  returning id, support_tickets.numero into v_id, v_num;
  insert into public.support_ticket_messages (ticket_id, author_kind, author_user_id, body, anexos)
  values (v_id, 'usuario', p_user, trim(p_corpo), coalesce(p_anexos, '[]'::jsonb));
  if p_autorizar then
    v_grant := public.suporte_autorizar(p_tenant, p_user, p_user, 'chamado', v_id, p_clinico, p_horas);
    update public.support_tickets set grant_id = v_grant where id = v_id;
  end if;
  update public.support_signals set updated_at = now() where id = 1;
  return query select v_id, v_num;
end $$;

-- Responde: a mensagem, a situação e as datas do chamado, e o sinal.
create or replace function public.chamado_responder(
  p_ticket uuid, p_autor text, p_user uuid, p_staff uuid, p_corpo text, p_anexos jsonb,
  p_interna boolean, p_status text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_t record;
begin
  select * into v_t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if p_status is not null and p_status not in ('aberto', 'em_andamento', 'aguardando_clinica', 'resolvido') then
    raise exception 'Situação inválida.';
  end if;
  insert into public.support_ticket_messages (ticket_id, author_kind, author_user_id, author_staff_id, body, anexos, interna)
  values (p_ticket, p_autor, p_user, p_staff, trim(p_corpo), coalesce(p_anexos, '[]'::jsonb), coalesce(p_interna, false))
  returning id into v_id;
  update public.support_tickets set
    status = coalesce(p_status, status),
    updated_at = now(),
    last_message_at = case when coalesce(p_interna, false) then last_message_at else now() end,
    last_staff_reply_at = case when p_autor = 'suporte' and not coalesce(p_interna, false) then now() else last_staff_reply_at end,
    resolved_at = case when coalesce(p_status, status) = 'resolvido' then coalesce(resolved_at, now()) else null end,
    assigned_staff_id = coalesce(assigned_staff_id, p_staff)
  where id = p_ticket;
  update public.support_signals set updated_at = now() where id = 1;
  return v_id;
end $$;

revoke execute on function public.chamado_abrir(uuid, uuid, uuid, text, text, jsonb, jsonb, boolean, boolean, int) from public, anon, authenticated;
revoke execute on function public.chamado_responder(uuid, text, uuid, uuid, text, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.chamado_abrir(uuid, uuid, uuid, text, text, jsonb, jsonb, boolean, boolean, int) to service_role;
grant execute on function public.chamado_responder(uuid, text, uuid, uuid, text, jsonb, boolean, text) to service_role;

notify pgrst, 'reload schema';
