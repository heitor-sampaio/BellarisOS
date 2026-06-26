-- CRM Omnichannel Inbox
-- conversations: thread de comunicação por lead/cliente e canal
-- messages: mensagens individuais dentro de uma conversa

-- ─── conversations ────────────────────────────────────────────────
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id)  on delete cascade,
  branch_id       uuid not null references public.branches(id) on delete cascade,
  lead_id         uuid references public.leads(id)    on delete set null,
  client_id       uuid references public.clients(id)  on delete set null,
  channel         text not null default 'manual'
    check (channel in ('whatsapp', 'instagram', 'email', 'manual')),
  status          text not null default 'open'
    check (status in ('open', 'pending', 'closed')),
  unread_count    int  not null default 0,
  last_message_at timestamptz,
  last_message    text,
  contact_name    text,   -- denormalizado para exibição rápida
  contact_phone   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.conversations (tenant_id, last_message_at desc nulls last);
create index on public.conversations (lead_id)   where lead_id   is not null;
create index on public.conversations (client_id) where client_id is not null;
create index on public.conversations (branch_id, status);

-- ─── messages ─────────────────────────────────────────────────────
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  tenant_id       uuid not null,
  direction       text not null check (direction in ('inbound', 'outbound')),
  content         text not null,
  channel         text not null default 'manual'
    check (channel in ('whatsapp', 'instagram', 'email', 'manual')),
  status          text not null default 'sent'
    check (status in ('sending', 'sent', 'delivered', 'read', 'failed')),
  external_id     text,    -- ID da mensagem no canal externo (ex: WhatsApp message id)
  sent_by_id      uuid references public.users(id),
  sent_by_name    text,    -- denormalizado
  is_read         boolean  not null default false,
  created_at      timestamptz not null default now()
);

create index on public.messages (conversation_id, created_at);
create index on public.messages (tenant_id, is_read) where not is_read;

-- ─── trigger: atualiza conversations quando chega nova mensagem ───
create or replace function public.on_new_message()
returns trigger language plpgsql as $$
begin
  update public.conversations
  set
    last_message     = left(new.content, 80),
    last_message_at  = new.created_at,
    updated_at       = now(),
    unread_count     = case
      when new.direction = 'inbound' then unread_count + 1
      else unread_count
    end
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_on_new_message
  after insert on public.messages
  for each row execute function public.on_new_message();

-- ─── RLS ──────────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.messages       enable row level security;

create policy "Network admin acessa conversas da rede" on public.conversations
  for all using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') in ('NETWORK_ADMIN', 'FINANCIAL', 'BRANCH_ADMIN', 'RECEPTIONIST')
  );

create policy "Operacional acessa mensagens da rede" on public.messages
  for all using (
    tenant_id::text = auth.jwt_claim('tenant_id')
    and auth.jwt_claim('role') in ('NETWORK_ADMIN', 'FINANCIAL', 'BRANCH_ADMIN', 'RECEPTIONIST')
  );
