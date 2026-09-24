-- Estorno em uma transação só.
--
-- `reverseTransaction` fazia duas gravações soltas: inseria a contra-transação
-- ("Estorno: …") e marcava a original com `notes = 'Estornada'`. Nenhuma das
-- duas checava o erro, e não havia transação entre elas. Falhar no meio deixava
-- o estorno pela metade — e é o pior meio possível, porque os indicadores leem
-- os DOIS lados (CLAUDE.md §13.1): com a contra-transação criada e a original
-- não marcada, o estorno bate duas vezes no resultado.
--
-- A função resolve três coisas de uma vez:
--   1. atomicidade — corpo de função é uma transação;
--   2. a filial passa a vir do REGISTRO, não do parâmetro. A action recebia
--      `branchId` do cliente e o usava na contra-transação: dava para estornar
--      um lançamento de uma unidade e jogar a despesa em outra;
--   3. estorno duplo vira erro em vez de uma segunda contra-transação.
--
-- Padrão do banco: jwt_claim(...) em public, NUNCA auth.jwt_claim.
-- Idempotente: pode rodar de novo em clone/CI.

CREATE OR REPLACE FUNCTION public.estornar_transacao(
  p_transacao uuid,
  p_tenant    uuid,
  p_ator      text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx      public.financial_transactions%ROWTYPE;
  v_tenant  uuid;
  v_novo_id uuid;
BEGIN
  -- FOR UPDATE: duas pessoas clicando em "estornar" ao mesmo tempo geravam
  -- duas contra-transações. A segunda agora espera e cai na checagem abaixo.
  SELECT t.* INTO v_tx
  FROM public.financial_transactions t
  WHERE t.id = p_transacao
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT b.tenant_id INTO v_tenant
  FROM public.branches b WHERE b.id = v_tx.branch_id;

  IF v_tenant IS DISTINCT FROM p_tenant THEN
    -- Mesma frase de "não existe", de propósito: quem não tem acesso não
    -- deveria conseguir distinguir um id inexistente de um de outra rede.
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_tx.notes = 'Estornada' THEN
    RAISE EXCEPTION 'Este lançamento já foi estornado.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.financial_transactions (
    branch_id, client_id, appointment_id, treatment_plan_id,
    type, category, description, amount,
    is_paid, paid_at, created_by
  ) VALUES (
    v_tx.branch_id, v_tx.client_id, v_tx.appointment_id, v_tx.treatment_plan_id,
    CASE WHEN v_tx.type = 'INCOME' THEN 'EXPENSE' ELSE 'INCOME' END::public."TransactionType",
    'Estorno',
    'Estorno: ' || v_tx.description,
    v_tx.amount,
    true, now(), p_ator
  )
  RETURNING id INTO v_novo_id;

  UPDATE public.financial_transactions
     SET notes = 'Estornada', updated_at = now()
   WHERE id = p_transacao;

  RETURN v_novo_id;
END;
$$;

COMMENT ON FUNCTION public.estornar_transacao(uuid, uuid, text) IS
  'Estorna um lançamento: cria a contra-transação e marca a original, atomicamente. A filial vem do registro, nunca do chamador.';
