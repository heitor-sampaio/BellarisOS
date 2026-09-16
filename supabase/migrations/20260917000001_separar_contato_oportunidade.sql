-- Separa contato, oportunidade e cliente.
--
-- `leads` acumulava três papéis: a pessoa, a oportunidade e o vínculo com o
-- cliente. A conversa passa a ser o CONTATO (nome, telefone, identificadores,
-- tags, atribuição), `leads` fica sendo só a OPORTUNIDADE — e podem existir
-- várias por pessoa, uma por funil, ao longo do tempo.
--
-- Ganhar continua sendo `crm_stages.outcome = 'WON'`: não há campo novo para
-- isso. Cadastrar cliente é outro gesto, independente de ganhar.

alter table public.leads
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

alter table public.conversations
  add column if not exists tags text[] not null default '{}',
  add column if not exists attribution jsonb not null default '{}'::jsonb;

create index if not exists leads_conversation_idx on public.leads(conversation_id);
create index if not exists conversations_tags_idx on public.conversations using gin(tags);

comment on column public.leads.conversation_id is
  'Contato dono desta oportunidade. Toda oportunidade tem um; a regra vive na action que cria.';
comment on column public.conversations.tags is
  'Tags do CONTATO (a pessoa). Antes viviam em leads.tags, onde mudavam por oportunidade.';
comment on column public.conversations.attribution is
  'De onde a pessoa veio (utm, ctwa_clid, ad_id, source). Guardado aqui porque a conversa nao cria mais lead, e sem isso o rastro do anuncio se perderia entre a mensagem e a oportunidade.';

-- 1) Liga pelo vínculo que já existe.
update public.leads l
   set conversation_id = c.id
  from public.conversations c
 where c.lead_id = l.id and l.conversation_id is null;

-- 2) Reusa contato existente com o mesmo telefone: duas oportunidades da mesma
--    pessoa passam a compartilhar o contato, que é exatamente o modelo novo.
update public.leads l
   set conversation_id = c.id
  from public.conversations c
 where l.conversation_id is null
   and coalesce(l.phone, '') <> ''
   and c.tenant_id = l.tenant_id
   and c.channel = 'whatsapp'
   and c.contact_phone = nullif(regexp_replace(l.phone, '\D', '', 'g'), '');

-- 3) Cria contato para os que sobraram COM telefone, um por número distinto —
--    dois leads do mesmo número viram duas oportunidades do MESMO contato.
with orfaos as (
  select l.tenant_id, l.branch_id, l.name, l.client_id, l.tags,
         nullif(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), '') as fone
    from public.leads l
   where l.conversation_id is null and coalesce(l.phone, '') <> ''
),
grupos as (
  select distinct on (tenant_id, fone) tenant_id, branch_id, name, client_id, tags, fone
    from orfaos
   where fone is not null
   order by tenant_id, fone, name
),
novas as (
  insert into public.conversations
    (tenant_id, branch_id, client_id, channel, status, contact_name,
     contact_phone, contact_external_id, contact_aliases, tags)
  select tenant_id, branch_id, client_id, 'whatsapp', 'open', name,
         fone, fone, array[fone], coalesce(tags, '{}')
    from grupos
  returning id, tenant_id, contact_phone
)
update public.leads l
   set conversation_id = n.id
  from novas n
 where l.conversation_id is null
   and n.tenant_id = l.tenant_id
   and n.contact_phone = nullif(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), '');

-- 4) Os sem telefone ganham um contato próprio, no canal manual.
with orfaos as (
  select id, tenant_id, branch_id, name, client_id, tags
    from public.leads
   where conversation_id is null
),
novas as (
  insert into public.conversations
    (tenant_id, branch_id, lead_id, client_id, channel, status, contact_name, tags)
  select tenant_id, branch_id, id, client_id, 'manual', 'open', name, coalesce(tags, '{}')
    from orfaos
  returning id, lead_id
)
update public.leads l
   set conversation_id = n.id
  from novas n
 where n.lead_id = l.id;

-- 5) Tags e cliente sobem do lead para o contato, sem sobrescrever o que houver.
update public.conversations c
   set tags = coalesce(l.tags, '{}')
  from public.leads l
 where l.conversation_id = c.id
   and coalesce(array_length(c.tags, 1), 0) = 0
   and coalesce(array_length(l.tags, 1), 0) > 0;

update public.conversations c
   set client_id = l.client_id
  from public.leads l
 where l.conversation_id = c.id
   and c.client_id is null
   and l.client_id is not null;
