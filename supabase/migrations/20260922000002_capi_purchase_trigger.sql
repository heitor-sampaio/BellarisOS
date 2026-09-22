-- Purchase para a Meta: registrado por GATILHO, não por chamada no código.
--
-- Um pagamento vira real em seis lugares diferentes hoje (concluir
-- atendimento, receber plano, marcar pago, lançamento avulso, entrada de
-- estoque…). Instrumentar um a um é garantir esquecer o sétimo — e o que se
-- perde aqui é dinheiro não atribuído a campanha, que ninguém percebe faltando.
--
-- A troca consciente: `Purchase` chega com até uma hora de atraso, porque o
-- gatilho só REGISTRA e o cron envia. Para ele isso é aceitável — quem otimiza
-- a campanha é o `Schedule`, que sai no ato; o `Purchase` serve para ROI e
-- valor, onde completude vale mais que pressa.

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
begin
  -- Só receita paga. Despesa não é conversão, e transação que já estava paga
  -- não gera evento de novo (um update de qualquer outro campo passaria aqui).
  if new.is_paid is not true then return new; end if;
  if tg_op = 'UPDATE' and old.is_paid is true then return new; end if;
  if new.type::text <> 'INCOME' then return new; end if;
  if new.client_id is null then return new; end if;

  -- Estorno gera contra-transação; ela é despesa e já saiu no filtro acima.
  if coalesce(new.category, '') = 'Estorno' then return new; end if;

  select b.tenant_id, c.ctwa_clid
    into v_tenant, v_clid
  from public.clients c
  join public.branches b on b.id = new.branch_id
  where c.id = new.client_id;

  -- Sem clique não há atribuição possível: a esmagadora maioria dos
  -- pagamentos não veio de anúncio, e registrar todos só encheria a tabela.
  if v_clid is null or v_tenant is null then return new; end if;

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
  -- A dedup de verdade: o mesmo pagamento não vira dois eventos, venha por
  -- onde vier.
  on conflict (tenant_id, event_id) do nothing;

  return new;
end
$$;

comment on function public.on_transaction_paid is
  'Registra um Purchase para a API de Conversões quando uma receita de cliente '
  'vindo de anúncio é paga. Só registra: o envio é do cron.';

drop trigger if exists trg_transaction_paid on public.financial_transactions;
create trigger trg_transaction_paid
  after insert or update of is_paid on public.financial_transactions
  for each row execute function public.on_transaction_paid();
