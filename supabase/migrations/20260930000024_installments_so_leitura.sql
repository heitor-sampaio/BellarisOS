-- `installments` virou histórico em 2026-09-30 (cada parcela é um lançamento,
-- migration 20260930000023): nada novo é escrito lá, e o app só a lia pelo
-- servidor. A política era FOR ALL sem WITH CHECK — a sessão podia inserir e
-- alterar parcelas pela chave pública. Fica só a leitura, com a mesma regra.
drop policy if exists installments_operacional on public.installments;
drop policy if exists installments_select on public.installments;
create policy installments_select on public.installments for select using (
  jwt_claim('role') <> 'CLIENT'
  and exists (
    select 1 from public.financial_transactions ft
     where ft.id = installments.transaction_id and private.can_access_branch(ft.branch_id)
  )
);
