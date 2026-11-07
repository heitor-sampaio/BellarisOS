-- A41 da 9ª simulação (2026-11-07; princípio 3): a ficha dizia "o dinheiro
-- entrou quando o crédito nasceu" também no crédito CONCEDIDO pela clínica —
-- que nunca teve dinheiro. O crédito passa a dizer de onde veio: o
-- `concedido` (o "Conceder crédito": o crédito de fora, a cortesia), ao lado
-- do comprado (`credito_vendido_id`, decisão 1 da 9ª) e do que ficou de um
-- cancelamento ou de uma devolução (o dinheiro que a cliente já tinha pago).
--
-- O crédito concedido de antes se reconhece por não ter dinheiro por trás: sem
-- o lançamento que o gerou (`transaction_id`), sem venda de crédito e sem a
-- descrição que o cancelamento e a devolução gravam ("Cancelamento…",
-- "Devolução…", "Estorno…"). Só marca a coluna; nada se cria nem se apaga.

alter table public.internal_credits add column if not exists concedido boolean not null default false;

comment on column public.internal_credits.concedido is
  'Crédito CONCEDIDO pela clínica, sem dinheiro (o "Conceder crédito"; A41 da 9ª). O comprado tem credito_vendido_id; o resto veio de um pagamento (cancelamento, devolução, estorno).';

update public.internal_credits
   set concedido = true
 where amount > 0
   and transaction_id is null
   and credito_vendido_id is null
   and description not ilike 'Cancelamento%'
   and description not ilike 'Devolu%'
   and description not ilike 'Estorno%'
   and not concedido;
