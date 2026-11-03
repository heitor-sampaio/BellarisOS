-- ven-04: a `descricao` da venda ("2× Sérum + 1× Protetor") é só do KIT. A
-- venda de um produto só fica sem ela, e as Vendas e o extrato da comissão
-- seguem dizendo o nome do produto, como antes ("Sérum", não "1× Sérum").
-- Uma troca só no corpo de `produto_vender_itens` (20261101001103).
do $do$
declare v text;
begin
  v := pg_get_functiondef('public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure);
  if position('0, p_vendedor, v_agora, v_descricao)' in v) = 0 then
    raise exception 'corpo inesperado';
  end if;
  execute replace(v, '0, p_vendedor, v_agora, v_descricao)', '0, p_vendedor, v_agora, case when jsonb_array_length(v_itens) > 1 then v_descricao end)');
end $do$;
notify pgrst, 'reload schema';
