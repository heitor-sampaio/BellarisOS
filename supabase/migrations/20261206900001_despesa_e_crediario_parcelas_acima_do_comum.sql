-- A parcela acima de 48 não é recusada pelo banco (princípio 2).
--
-- O Heitor, 25/11, à pergunta se o "no máximo, avisar" do princípio 2 vale
-- para os limites da despesa (parcelada em até 48, recorrente em até 60):
-- "Se não for impossível, ainda que improvável, pode ser feito." Acima do
-- comum, a tela avisa e o servidor grava.
--
-- `financial_transactions_parcela_coerente` (20260930000023) prendia
-- `parcela_total` entre 1 e 48. Era também um defeito do crediário: o limite
-- dele virou aviso em 20261204200001 (a rede pode fazer em 60), mas cada
-- parcela grava `parcela_total` (`lancamentosDoPagamento`), e o crediário em 60
-- vezes seria recusado aqui, ao gravar. Fica só o coerente: o total de 1 para
-- cima e o número da parcela entre 1 e o total. O impossível (acima de 1.200
-- na despesa: 100 anos de datas mensais — decisão do Claude, 25/11; acima do
-- registro no crediário) se confere no app, que diz por quê.

alter table public.financial_transactions
  drop constraint if exists financial_transactions_parcela_coerente,
  add constraint financial_transactions_parcela_coerente check (
    (parcela_numero is null and parcela_total is null)
    or (parcela_total >= 1 and parcela_numero between 1 and parcela_total)
  );

notify pgrst, 'reload schema';
