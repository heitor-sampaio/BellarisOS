-- A conversa deixa de ser o registro do contato.
--
-- Até aqui `conversations` era as duas coisas: a THREAD (canal, caixa, não
-- lidas, janela) e a PESSOA (nome, telefone, identificadores, tags, de onde
-- veio). Isso funcionava porque cada pessoa tinha uma conversa só.
--
-- Deixou de funcionar quando a rede passou a ter vários números. O dedup inclui
-- a caixa — de propósito, porque no celular do cliente são duas conversas mesmo
-- —, então a mesma pessoa falando com duas caixas virava DUAS fichas de contato:
-- dois nomes, duas listas de tags, duas atribuições de anúncio. E
-- `leads.conversation_id` é singular, então o card ficava preso numa delas
-- enquanto o atendimento acontecia na outra.
--
-- O buraco aparece exatamente no handoff — lead entra pelo marketing, a SDR
-- qualifica e agenda, a unidade assume por outro número —, que é o momento em
-- que ler o histórico é o que mais importa.
--
-- E isso não é novo: já acontece hoje entre Instagram e WhatsApp, onde a mesma
-- pessoa sempre foi duas conversas. Os múltiplos números só transformaram um
-- caso raro em rotina.
--
-- **Esta migration é só a espinha.** Ela cria a pessoa e liga a conversa a ela.
-- NENHUM leitor muda: nome, telefone e tags continuam sendo lidos da conversa,
-- exatamente como hoje. O objetivo é a pessoa passar a ser joinável — os
-- leitores migram um por um depois, e cada campo sai da conversa só quando
-- alguém do outro lado já lê do contato.
--
-- Nome de tabela e de coluna em inglês, como o resto do schema
-- (`conversations`, `leads`, `message_templates`, `whatsapp_numbers`).

create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,

  -- Nome e telefone vivem aqui para esta linha ser reconhecível por gente
  -- quando algo der errado. ⚠️ **Não são a fonte da tela** enquanto os leitores
  -- não migrarem: a fonte segue sendo `conversations.contact_name/phone`. Os
  -- dois são mantidos pelo MESMO caminho de escrita (`completarIdentidade`),
  -- que é o que impede divergirem.
  name        text,
  phone       text,

  -- TODOS os identificadores desta pessoa, em qualquer canal: telefone, @lid,
  -- BSUID do WhatsApp, PSID do Messenger, IGSID do Instagram.
  --
  -- É a chave de identidade, e a invariante é: para toda conversa,
  -- `contact_aliases` ⊆ `identifiers` do contato dela. Um superconjunto, escrito
  -- num lugar só. `e2e/contato-espinha.spec.ts` confere isso — se divergir, o
  -- cruzamento de threads passa a errar em silêncio, que é o pior lugar.
  identifiers text[] not null default '{}',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_contacts_tenant
  on public.contacts (tenant_id);
-- GIN porque a busca é `identifiers && ARRAY[...]`, igual à de `contact_aliases`.
create index if not exists idx_contacts_identifiers
  on public.contacts using gin (identifiers);

alter table public.contacts enable row level security;

-- Espelha `conversations_select_tenant`: a rede lê e escreve, cliente final
-- nunca. **Sem `can_access_branch`**, ao contrário de `conversations`: a pessoa
-- não é de uma unidade. Quem tem unidade é o atendimento, e é a conversa que
-- carrega isso.
drop policy if exists contacts_operacional on public.contacts;
create policy contacts_operacional on public.contacts
  for all using (
    tenant_id::text = public.jwt_claim('tenant_id')
    and public.jwt_claim('role') <> 'CLIENT'
  );

comment on table public.contacts is
  'A PESSOA. Uma por rede; pode ter várias conversas (uma por caixa e canal) e várias oportunidades. A conversa é a thread, não a pessoa.';
comment on column public.contacts.identifiers is
  'Todos os identificadores desta pessoa em todos os canais. Invariante: contact_aliases de cada conversa dela é subconjunto disto.';

alter table public.conversations
  add column if not exists contato_id uuid
  references public.contacts(id) on delete set null;

create index if not exists idx_conversations_contato
  on public.conversations (contato_id) where contato_id is not null;

comment on column public.conversations.contato_id is
  'De quem é esta thread. Nulo só em linha antiga ou quando a criação do contato falhou — nunca é motivo para descartar a mensagem.';

-- ── Backfill ─────────────────────────────────────────────────────────────────
--
-- O 1:1 abaixo SÓ está correto porque hoje nenhuma conversa compartilha
-- identificador com outra (medido antes de escrever isto: 0 pares em 61
-- conversas, 61 pessoas distintas). Se isso deixar de ser verdade, o 1:1 criaria
-- dois contatos para a MESMA pessoa em silêncio — e silêncio aqui é o defeito
-- que a tabela veio consertar.
--
-- Então a migration PARA e alguém decide o agrupamento, em vez de adivinhar.
-- Escrever a lógica de agrupamento agora seria pior: código não exercitado
-- rodando numa migration.
do $$
begin
  if exists (
    select 1
    from public.conversations a
    join public.conversations b
      on a.tenant_id = b.tenant_id
     and a.id < b.id
     and a.contact_aliases && b.contact_aliases
  ) then
    raise exception 'Há conversas com identificador em comum: o backfill 1:1 criaria dois contatos para a mesma pessoa. Agrupe-as antes de rodar.';
  end if;
end $$;

-- Linha a linha de propósito: são dezenas, e `insert ... select` não devolve de
-- qual conversa cada contato nasceu (não há coluna que correlacione as duas).
-- Idempotente pelo `contato_id is null`.
do $$
declare
  c    record;
  novo uuid;
begin
  for c in
    select id, tenant_id, contact_name, contact_phone, contact_aliases, created_at
    from public.conversations
    where contato_id is null
    order by created_at
  loop
    insert into public.contacts (tenant_id, name, phone, identifiers, created_at, updated_at)
    values (
      c.tenant_id,
      c.contact_name,
      c.contact_phone,
      coalesce(c.contact_aliases, '{}'),
      c.created_at,
      now()
    )
    returning id into novo;

    update public.conversations set contato_id = novo where id = c.id;
  end loop;
end $$;
