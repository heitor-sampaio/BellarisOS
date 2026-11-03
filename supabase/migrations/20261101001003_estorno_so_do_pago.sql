-- O evento de estorno só do que estava PAGO (achado da F2b, 913c1ad8).
--
-- A parcela NUNCA paga que cai — o crediário que o cancelamento do pacote
-- derruba (F2b, `pacote_cancelar`), a venda de produto toda a receber
-- cancelada (F3, `produto_estornar_venda`) — sai marcada `Estornada` (sem
-- contra-lançamento: não entrou dinheiro), e o gatilho
-- `trg_transaction_reversed` emitia `pagamento.estornado`. Uma automação
-- ligada nesse evento avisaria a cliente de um estorno que não houve.
--
-- O corpo é o da produção (pg_get_functiondef em 2026-11-03), com UMA linha a
-- mais: o lançamento que não estava pago não emite.

create or replace function public.on_transaction_reversed()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tenant uuid;
  v_nome   text;
begin
  if coalesce(new.notes, '') <> 'Estornada' then return new; end if;
  if coalesce(old.notes, '') = 'Estornada' then return new; end if;
  -- Nunca pago (a parcela que cai, a venda toda a receber cancelada): não
  -- houve dinheiro, não houve estorno.
  if not coalesce(old.is_paid, false) then return new; end if;
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
      'clienteId', new.client_id, 'clienteNome', v_nome, 'valor', new.amount,
      'formaPagamento', new.payment_method::text, 'categoria', new.category,
      'descricao', new.description, 'planoId', new.treatment_plan_id,
      'agendamentoId', new.appointment_id
    ),
    'sistema', 'banco', 'pagamento.estornado:' || new.id, now()
  )
  on conflict (tenant_id, chave) where chave is not null do nothing;

  return new;
end
$function$;

notify pgrst, 'reload schema';
