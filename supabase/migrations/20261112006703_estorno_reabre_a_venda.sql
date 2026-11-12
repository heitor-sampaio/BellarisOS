-- C39 do levantamento das regras (F67, 2026-11-12; H2 = a, o Heitor,
-- 2026-11-11): o estorno AVULSO do pagamento de um pacote, de um plano ou de um
-- pré-pago reabre a cobrança — o pagamento volta a ser "a receber" da mesma
-- venda, com o mesmo vencimento. A mesma regra da D6 (28/10) para o
-- atendimento avulso. Até aqui o dinheiro voltava à cliente e as sessões
-- seguiam livres, sem nada a cobrar.
--
-- `estornar_transacao` NÃO muda: os cancelamentos (cancelamento_dinheiro, a
-- unidade pré-paga, a devolução de produto, o crédito vendido) a chamam para
-- devolver o dinheiro de uma venda que está sendo DESFEITA — ali nada reabre.
-- A reabertura é deste invólucro, que só o "Estornar" da lista chama
-- (`reverseTransaction`).

create or replace function public.estornar_e_reabrir(
  p_transacao uuid, p_tenant uuid, p_ator text, p_motivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estorno uuid;
  v_tx      public.financial_transactions%rowtype;
  v_vivo    boolean := false;
  v_reaberta uuid;
begin
  v_estorno := public.estornar_transacao(p_transacao, p_tenant, p_ator, p_motivo);

  select * into v_tx from public.financial_transactions where id = p_transacao;

  -- Só o pagamento de uma VENDA que segue viva: pacote não cancelado, plano não
  -- cancelado, pré-pago. O do atendimento avulso já reabre pela D6 (o
  -- lançamento vivo), e o de produto e o de crédito vendido o banco recusa.
  if v_tx.type = 'INCOME' and v_tx.appointment_id is null
     and v_tx.product_sale_id is null and v_tx.credito_vendido_id is null then
    if v_tx.client_package_id is not null then
      select cp.cancelado_em is null into v_vivo from public.client_packages cp where cp.id = v_tx.client_package_id;
    elsif v_tx.treatment_plan_id is not null then
      select tp.cancelado_em is null and tp.status <> 'CANCELLED' into v_vivo from public.treatment_plans tp where tp.id = v_tx.treatment_plan_id;
    elsif v_tx.procedure_sale_id is not null then
      v_vivo := true;
    end if;
  end if;

  if coalesce(v_vivo, false) then
    insert into public.financial_transactions
      (branch_id, client_id, treatment_plan_id, client_package_id, procedure_sale_id,
       type, category, description, amount, due_date, is_paid, notes, created_by,
       parcela_numero, parcela_total, parcela_grupo)
    values
      (v_tx.branch_id, v_tx.client_id, v_tx.treatment_plan_id, v_tx.client_package_id, v_tx.procedure_sale_id,
       'INCOME', v_tx.category, v_tx.description, v_tx.amount, v_tx.due_date, false, 'Reaberta pelo estorno', p_ator,
       v_tx.parcela_numero, v_tx.parcela_total, v_tx.parcela_grupo)
    returning id into v_reaberta;
  end if;

  return jsonb_build_object('estorno', v_estorno, 'reaberta', v_reaberta);
end
$$;

revoke execute on function public.estornar_e_reabrir(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.estornar_e_reabrir(uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
