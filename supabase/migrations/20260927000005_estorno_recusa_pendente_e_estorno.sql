-- O estorno passa a recusar o que não se estorna.
--
-- Achado na varredura de cobertura de 2026-09-27: `estornar_transacao` aceitava
--
--   1. lançamento NÃO pago — criava uma contra-transação PAGA, ou seja, dinheiro
--      saindo do caixa por uma receita que nunca entrou;
--   2. a própria contra-transação (`category = 'Estorno'`) — e a tela mostrava o
--      botão "Estornar" nela, porque ela nasce paga e sem `notes`. Estornar o
--      estorno gerava "Estorno: Estorno: …" e o resultado virava ruído contábil.
--
-- Lançamento pendente se cancela, não se estorna; e desfazer um estorno é
-- estornar de novo a ORIGINAL, que já está marcada.
--
-- Junto: `search_path` fixo (aviso do advisor) e EXECUTE só para o servidor —
-- quem chama é `reverseTransaction`, pelo cliente de serviço, depois de
-- conferir `financial: MANAGE`.

create or replace function public.estornar_transacao(p_transacao uuid, p_tenant uuid, p_ator text)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_tx      public.financial_transactions%rowtype;
  v_tenant  uuid;
  v_novo_id uuid;
begin
  select t.* into v_tx
  from public.financial_transactions t
  where t.id = p_transacao
  for update;

  if not found then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  select b.tenant_id into v_tenant
  from public.branches b where b.id = v_tx.branch_id;

  if v_tenant is distinct from p_tenant then
    raise exception 'Lançamento não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_tx.notes = 'Estornada' then
    raise exception 'Este lançamento já foi estornado.' using errcode = 'invalid_parameter_value';
  end if;

  if v_tx.category = 'Estorno' then
    raise exception 'Um estorno não se estorna — para desfazer, fale com o financeiro.' using errcode = 'invalid_parameter_value';
  end if;

  if not v_tx.is_paid then
    raise exception 'Lançamento ainda não pago: não há o que estornar.' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.financial_transactions (
    branch_id, client_id, appointment_id, treatment_plan_id,
    type, category, description, amount,
    is_paid, paid_at, created_by
  ) values (
    v_tx.branch_id, v_tx.client_id, v_tx.appointment_id, v_tx.treatment_plan_id,
    case when v_tx.type = 'INCOME' then 'EXPENSE' else 'INCOME' end::public."TransactionType",
    'Estorno',
    'Estorno: ' || v_tx.description,
    v_tx.amount,
    true, now(), p_ator
  )
  returning id into v_novo_id;

  update public.financial_transactions
     set notes = 'Estornada', updated_at = now()
   where id = p_transacao;

  return v_novo_id;
end;
$function$;

revoke execute on function public.estornar_transacao(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.estornar_transacao(uuid, uuid, text) to service_role;
