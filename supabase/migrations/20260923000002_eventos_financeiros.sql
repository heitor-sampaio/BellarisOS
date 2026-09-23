-- Eventos de dinheiro: `pagamento.recebido` e `pagamento.estornado`.
--
-- ⚠️ Estes DOIS saem de gatilho no banco, e não da aplicação como todos os
-- outros. É uma exceção deliberada, e a razão é a mesma que já decidiu o
-- `Purchase` da API de Conversões: **um pagamento vira real em seis lugares do
-- código** (concluir atendimento, receber plano, marcar pago, lançamento
-- avulso, entrada de estoque, checkout). Instrumentar um a um é garantir
-- esquecer o sétimo, e o que se perde é uma venda que a automação não vê —
-- falta que ninguém percebe acontecendo.
--
-- O preço é conhecido: o banco não sabe QUEM registrou o pagamento, porque
-- toda escrita passa pelo service role e `auth.uid()` é nulo. Para dinheiro,
-- completude vale mais que ator: nenhuma automação de pagamento precisa saber
-- qual recepcionista digitou — precisa saber que entrou.
--
-- Daí a origem nova: 'banco'. Dizer 'app' seria mentir sobre a procedência, e
-- é pela origem que o motor saberá que ali não há ator.

alter table public.domain_events
  drop constraint if exists domain_events_origem_check;

alter table public.domain_events
  add constraint domain_events_origem_check
  check (origem in ('app', 'webhook', 'cron', 'banco'));

comment on column public.domain_events.origem is
  'De onde o fato veio. ''banco'' = gatilho no Postgres, e por isso SEM ator: '
  'a escrita passa pelo service role e auth.uid() é nulo.';


-- ─── Recebimento ──────────────────────────────────────────────────────────
--
-- O gatilho que já existia para a API de Conversões passa a alimentar também a
-- corrente. Um gatilho só, dois destinos: os dois reagem ao MESMO fato, e
-- duplicar a regra de detecção criaria duas verdades sobre o que é um
-- pagamento.
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
  -- A contrapartida do estorno não é recebimento. O estorno tem gatilho
  -- próprio, abaixo, e sobre a transação ORIGINAL — a contrapartida nasce sem
  -- cliente e sem valor atribuível a ninguém.
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
      'clienteId',      new.client_id,
      'clienteNome',    v_nome,
      'valor',          new.amount,
      'formaPagamento', new.payment_method::text,
      'categoria',      new.category,
      'descricao',      new.description,
      'planoId',        new.treatment_plan_id,
      'agendamentoId',  new.appointment_id
    ),
    'sistema', 'banco',
    -- A transação é a unidade de dedup: o mesmo pagamento não vira dois
    -- eventos ainda que a linha seja atualizada de novo.
    'pagamento.recebido:' || new.id,
    coalesce(new.paid_at, now())
  )
  -- `where chave is not null`: o índice único é PARCIAL, e sem repetir o
  -- predicado o Postgres recusa com 42P10 — aqui, dentro de um gatilho, isso
  -- quebraria o próprio pagamento. Mesma armadilha de resolve-conversation.ts.
  on conflict (tenant_id, chave) where chave is not null do nothing;

  -- API de Conversões: só quem veio de anúncio.
  if v_clid is null then return new; end if;

  select (attribution ->> 'ad_id') into v_ad
  from public.conversations
  where tenant_id = v_tenant and client_id = new.client_id
  order by last_message_at desc nulls last
  limit 1;

  insert into public.meta_capi_events
    (tenant_id, event_id, event_name, ctwa_clid, ad_id, valor, ocorrido_em)
  values
    (v_tenant, 'purchase:' || new.id, 'Purchase', v_clid, v_ad,
     new.amount, coalesce(new.paid_at, now()))
  on conflict (tenant_id, event_id) do nothing;

  return new;
end
$$;


-- ─── Estorno ──────────────────────────────────────────────────────────────
--
-- Detectado na transação ORIGINAL, que ganha `notes = 'Estornada'` — e não na
-- contrapartida. A contrapartida nasce como `EXPENSE`, **sem `client_id`** e
-- com a descrição prefixada: não dá para dizer de quem foi o dinheiro
-- devolvido olhando só para ela. A original tem cliente, valor e o plano.
create or replace function public.on_transaction_reversed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_nome   text;
begin
  if coalesce(new.notes, '') <> 'Estornada' then return new; end if;
  if coalesce(old.notes, '') = 'Estornada' then return new; end if;
  if new.client_id is null then return new; end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = new.branch_id;
  if v_tenant is null then return new; end if;

  select c.name into v_nome from public.clients c where c.id = new.client_id;

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave, ocorrido_em)
  values (
    v_tenant, new.branch_id, 'pagamento.estornado', 'pagamento', new.id,
    jsonb_build_object(
      'clienteId',      new.client_id,
      'clienteNome',    v_nome,
      'valor',          new.amount,
      'formaPagamento', new.payment_method::text,
      'categoria',      new.category,
      'descricao',      new.description,
      'planoId',        new.treatment_plan_id,
      'agendamentoId',  new.appointment_id
    ),
    'sistema', 'banco',
    'pagamento.estornado:' || new.id,
    now()
  )
  -- `where chave is not null`: o índice único é PARCIAL, e sem repetir o
  -- predicado o Postgres recusa com 42P10 — aqui, dentro de um gatilho, isso
  -- quebraria o próprio pagamento. Mesma armadilha de resolve-conversation.ts.
  on conflict (tenant_id, chave) where chave is not null do nothing;

  return new;
end
$$;

comment on function public.on_transaction_reversed is
  'Emite pagamento.estornado quando a transação original é marcada Estornada. '
  'Na original, e não na contrapartida: esta nasce sem client_id.';

drop trigger if exists trg_transaction_reversed on public.financial_transactions;
create trigger trg_transaction_reversed
  after update of notes on public.financial_transactions
  for each row execute function public.on_transaction_reversed();
