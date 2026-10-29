-- A segunda metade de 20261028000801 (movimentação de estoque nunca gera
-- despesa): sai a assinatura antiga de estoque_inicial (com p_despesa) e
-- estoque_compra, que ficou sem uso. Aplicada depois do deploy do app que já
-- chama estoque_entrada e o estoque_inicial novo — antes dele, a "Entrada" e o
-- cadastro do app no ar ainda chamavam as duas.

drop function if exists public.estoque_inicial(uuid, uuid, numeric, numeric, text, text, timestamp with time zone, text, numeric, boolean, text);
drop function if exists public.estoque_compra(uuid, uuid, numeric, numeric, text, text, timestamp with time zone, text, boolean, text);

notify pgrst, 'reload schema';
