-- As tags são da PESSOA, e agora moram nela.
--
-- Elas já eram do contato — `conversations.tags` tinha o comentário "Tags do
-- CONTATO. Ficam na conversa: descrevem a pessoa, não o negócio". Ficavam ali
-- por falta de lugar. Com vários números isso deixou de ser só feio: a mesma
-- pessoa falando com duas caixas tinha DUAS listas de tags, e marcar "botox" na
-- thread da recepção não aparecia na do marketing.
--
-- `conversations.tags` passa a ser SEMENTE, não verdade: escrita uma vez, no
-- nascimento da thread (é de onde vêm as tags derivadas da origem), e nunca mais
-- lida pelo app. Fica para trás como cópia de resgate, como as linhas de
-- `integration_configs`, e sai numa migration própria depois do soak.

alter table public.contacts
  add column if not exists tags text[] not null default '{}';

comment on column public.contacts.tags is
  'Tags da PESSOA. Fonte única — `conversations.tags` é só a semente do nascimento da thread.';

create index if not exists idx_contacts_tags
  on public.contacts using gin (tags);

-- Backfill: a UNIÃO das tags de todas as threads da pessoa.
--
-- Hoje é 1:1 (uma thread por pessoa), então é uma cópia. União porque é o que
-- está certo se deixar de ser: perder a tag que só existia na segunda thread
-- seria perder o trabalho de quem a marcou.
update public.contacts k
set tags = coalesce(u.tags, '{}'),
    updated_at = now()
from (
  select c.contato_id, array_agg(distinct t) as tags
  from public.conversations c, unnest(c.tags) as t
  where c.contato_id is not null
    and t is not null
    and length(btrim(t)) > 0
  group by c.contato_id
) u
where k.id = u.contato_id;

comment on column public.conversations.tags is
  'SEMENTE das tags da pessoa, escrita no nascimento da thread. A fonte é `contacts.tags` — não leia daqui.';

-- O gatilho que liga a conversa à pessoa passa a semear as tags junto.
--
-- No MESMO lugar que já semeia nome, telefone e identificadores: manter isso num
-- ponto só é o que impede as cópias de divergirem. Quando a pessoa já existe, as
-- tags da thread nova se somam às dela — thread que nasce de um anúncio traz a
-- tag da origem, e essa informação é da pessoa.
create or replace function public.fn_conversa_ganha_contato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids       text[];
  -- ⚠️ NÃO chame esta variável de `tags`: `contacts.tags` é coluna, e no `update`
  -- abaixo a referência fica ambígua — `42702`, dentro do gatilho, o que faz o
  -- INSERT da conversa falhar e a mensagem do cliente ser descartada. Foi
  -- exatamente o que aconteceu na primeira versão desta função.
  tags_novas text[];
  achado    uuid;
begin
  if new.contato_id is not null then
    return new;
  end if;

  ids := array_remove(
    coalesce(nullif(new.contact_aliases, '{}'), array[new.contact_external_id]),
    null
  );
  tags_novas := array_remove(coalesce(new.tags, '{}'), null);

  if array_length(ids, 1) is null then
    insert into public.contacts (tenant_id, name, phone, identifiers, tags)
    values (new.tenant_id, new.contact_name, new.contact_phone, '{}', tags_novas)
    returning id into achado;
    new.contato_id := achado;
    return new;
  end if;

  select c.id into achado
  from public.contacts c
  where c.tenant_id = new.tenant_id
    and c.identifiers && ids
  limit 1;

  if achado is null then
    insert into public.contacts (tenant_id, name, phone, identifiers, tags)
    values (new.tenant_id, new.contact_name, new.contact_phone, ids, tags_novas)
    returning id into achado;
  else
    -- Colunas QUALIFICADAS (`c.`) — é o que torna impossível uma variável
    -- declarada aqui voltar a sombrear uma coluna sem ninguém notar.
    update public.contacts c
    set identifiers = (
          select coalesce(array_agg(distinct x), '{}')
          from unnest(c.identifiers || ids) as t(x)
        ),
        tags = (
          select coalesce(array_agg(distinct x), '{}')
          from unnest(c.tags || tags_novas) as t(x)
          where x is not null
        ),
        updated_at  = now()
    where c.id = achado;
  end if;

  new.contato_id := achado;
  return new;
end;
$$;

-- ── O anúncio de quem já é cliente, com várias threads ───────────────────────
--
-- `on_transaction_paid` procurava a atribuição na conversa MAIS RECENTE do
-- cliente. Com um número por rede havia uma conversa e dava no mesmo; com
-- vários, a mais recente pode ser a da recepção, que não tem anúncio nenhum — e
-- o evento da API de Conversões saía com `ad_id` nulo.
--
-- O sintoma disso é o pior tipo: a Meta recebe a compra sem saber de qual
-- anúncio ela veio, o ROI da campanha fica menor do que é, e nada no sistema
-- acusa. Exatamente o "número errado em silêncio" do §13.1.
--
-- A correção é procurar a conversa mais recente QUE TENHA anúncio. Melhor em
-- todos os casos, inclusive no de uma thread só.
--
-- ⚠️ A atribuição NÃO se mudou para o contato, e isso é deliberado: ela aponta
-- para o último anúncio DAQUELE retorno (`marcarAnuncioNaConversa` a reescreve
-- quando a pessoa volta por outro anúncio). É informação da thread. O que seria
-- do contato é a PRIMEIRA origem, e isso é um dado novo — não uma mudança de
-- casa —, então não entra antes de alguém precisar dele.
-- `search_path = public` é o que a função viva já tinha. Trocar por `''` aqui
-- seria mudar comportamento que não preciso mudar — o corpo é o mesmo, só a
-- busca do anúncio muda.
create or replace function public.on_transaction_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_clid   text;
  v_ad     text;
  v_nome   text;
begin
  if new.is_paid is not true then return new; end if;
  if tg_op = 'UPDATE' and old.is_paid is true then return new; end if;
  if new.type::text <> 'INCOME' then return new; end if;
  if new.client_id is null then return new; end if;
  if coalesce(new.category, '') = 'Estorno' then return new; end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = new.branch_id;
  if v_tenant is null then return new; end if;

  select c.name, c.ctwa_clid into v_nome, v_clid
  from public.clients c where c.id = new.client_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_tenant, new.branch_id, 'pagamento.recebido', 'pagamento', new.id,
    jsonb_build_object(
      'clienteId', new.client_id, 'clienteNome', v_nome, 'valor', new.amount,
      'formaPagamento', new.payment_method::text, 'categoria', new.category,
      'descricao', new.description, 'planoId', new.treatment_plan_id,
      'agendamentoId', new.appointment_id
    ),
    'sistema', 'banco', 'pagamento.recebido:' || new.id,
    coalesce(new.paid_at, now())
  )
  on conflict (tenant_id, chave) where chave is not null do nothing;

  if v_clid is null then return new; end if;

  -- A conversa mais recente QUE TENHA anúncio, e não simplesmente a mais
  -- recente: com várias threads por pessoa, a última a receber mensagem
  -- costuma ser a do atendimento, não a que veio da campanha.
  select (attribution ->> 'ad_id') into v_ad
  from public.conversations
  where tenant_id = v_tenant
    and client_id = new.client_id
    and attribution ->> 'ad_id' is not null
  order by last_message_at desc nulls last limit 1;

  insert into public.meta_capi_events
    (tenant_id, event_id, event_name, ctwa_clid, ad_id, valor, ocorrido_em)
  values
    (v_tenant, 'purchase:' || new.id, 'Purchase', v_clid, v_ad,
     new.amount, coalesce(new.paid_at, now()))
  on conflict (tenant_id, event_id) do nothing;

  return new;
end
$$;
