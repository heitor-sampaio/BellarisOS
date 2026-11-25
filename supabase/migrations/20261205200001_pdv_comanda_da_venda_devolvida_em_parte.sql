-- D9 da 29ª simulação (2026-11-25; vendas-financeiro PR-08: depois da
-- devolução de parte, a venda "passa a valer o vendido menos o devolvido (no
-- valor, nas unidades e no custo), em tudo o que a usa"). A comanda da venda de
-- 2 Sérum + 1 Protetor (R$ 390) com 1 Sérum devolvido seguia com "Total
-- R$ 390,00" na lista e na tela do PDV: o valor da comanda da VENDA soma os
-- lançamentos dela pelo valor de antes do estorno (`valor_antes_do_estorno`,
-- o gatilho do estorno parcial), e a devolução não mexe nele.
--
-- O valor da comanda da venda de PRODUTO passa a ser o da venda: o vendido
-- (`product_sales.price`) menos o devolvido (`valor_devolvido`) — a régua de
-- "O que nunca fazer aqui" (price − valor_devolvido). As outras vendas (pacote,
-- pré-pago, crédito) seguem pelos lançamentos, como antes.
--
-- Partes do corpo VIVO (o padrão `pg_temp.trocar_no_corpo`), com a contagem.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  de text;
  para text;
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    -- O arquivo pode ter vindo com CRLF; o corpo no banco, não.
    de := replace(p_de[i], chr(13), '');
    para := replace(p_para[i], chr(13), '');
    n := (length(d) - length(replace(d, de, ''))) / length(de);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, de, para);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.pdv_comandas(uuid,uuid,text,timestamptz,timestamptz)'::regprocedure,
  array[
    $t$when 'VENDA' then coalesce(s.v_valor, 0)$t$],
  array[
    $t$when 'VENDA' then case when s.product_sale_id is not null
                          then coalesce((select greatest(ps.price - coalesce(ps.valor_devolvido, 0), 0)
                                           from public.product_sales ps where ps.id = s.product_sale_id),
                                        coalesce(s.v_valor, 0))
                          else coalesce(s.v_valor, 0) end$t$],
  array[1]);

-- A conferência: o resto do corpo segue o de antes — as formas com a
-- maquininha (`20261130100003`) e as da venda e do plano no crediário
-- (`20261202200001`), que a tela escreve.
do $c$
declare
  v_def text := pg_get_functiondef('public.pdv_comandas(uuid,uuid,text,timestamptz,timestamptz)'::regprocedure);
begin
  if position($t$'maquininha', x.maquininha$t$ in v_def) = 0 then
    raise exception 'pdv_comandas sem a maquininha nas formas: confira 20261130100003';
  end if;
  if position($t$where s.origem in ('VENDA', 'PLANO') and coalesce(s.v_forma, '') <> 'A_RECEBER'$t$ in v_def) = 0 then
    raise exception 'pdv_comandas sem as formas da venda e do plano: confira 20261202200001';
  end if;
  if position($t$ps.price - coalesce(ps.valor_devolvido, 0)$t$ in v_def) = 0 then
    raise exception 'pdv_comandas sem o devolvido na venda de produto';
  end if;
end
$c$;

notify pgrst, 'reload schema';
