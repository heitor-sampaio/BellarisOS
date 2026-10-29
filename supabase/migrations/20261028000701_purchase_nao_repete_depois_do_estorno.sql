-- O segundo pagamento depois do estorno NÃO manda outro "Purchase" à Meta
-- (decisão do Heitor, 2026-10-28).
--
-- D6 (20261028000201): estornada a receita de um atendimento, ele volta a
-- "a receber" e o novo recebimento é um lançamento NOVO — e o gatilho mandava
-- um "Purchase" por lançamento. A Meta não sabe do estorno, então contaria
-- duas compras para uma venda. Agora: se outro lançamento DO MESMO
-- atendimento já mandou o "Purchase", este não manda de novo. O evento
-- interno `pagamento.recebido` continua (é o fato da clínica).
--
-- Corpo de partida: o de produção em 2026-10-28 (pg_get_functiondef).

create or replace function public.on_transaction_paid()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  if v_clid is null or new.amount <= 0 then return new; end if;

  -- O mesmo atendimento já mandou o "Purchase" por outro lançamento (o
  -- estornado): este é o pagamento de novo, não uma compra nova.
  if new.appointment_id is not null and exists (
    select 1
      from public.financial_transactions f
      join public.meta_capi_events e
        on e.tenant_id = v_tenant and e.event_id = 'purchase:' || f.id
     where f.appointment_id = new.appointment_id
       and f.id <> new.id
  ) then
    return new;
  end if;

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
$function$;

notify pgrst, 'reload schema';
