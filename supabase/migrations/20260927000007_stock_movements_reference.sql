-- A transferência de estoque NUNCA funcionou.
--
-- `adminTransferStock` grava as duas pernas (TRANSFER_OUT e TRANSFER_IN) com o
-- mesmo `reference` para uma reconhecer a outra — e a coluna não existia. Todo
-- clique em "Confirmar transferência" respondia "Não consegui registrar a
-- transferência." (PGRST204). Achado em 2026-09-27 pelo primeiro teste que
-- passou pela tela (`e2e/estoque-movimentos.spec.ts`).
--
-- Coluna nula: os movimentos que já existem não têm par nenhum.

alter table public.stock_movements
  add column if not exists reference text;

comment on column public.stock_movements.reference is
  'Liga os movimentos de uma mesma operação — as duas pernas de uma transferência. Nulo nos avulsos.';

create index if not exists idx_stock_movements_reference
  on public.stock_movements (reference) where reference is not null;

notify pgrst, 'reload schema';
