-- A15 da 26ª simulação, ainda aberto no PLANO (27ª, C01; princípio 3): a
-- comanda do plano com a entrada em Pix e o resto no crediário dizia só
-- "Crediário" na lista do PDV. O conserto de `20261130100003` devolveu as
-- formas do que já entrou à venda (`vp`, só `origem = 'VENDA'`); a comanda do
-- plano ficava sem `formas`, e `formasDaComandaEmTexto` escrevia "Crediário"
-- sem a forma da entrada. Agora o `vp` lê também os lançamentos do plano
-- (`treatment_plan_id`), e a tela diz "Crediário (Pix)".
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
    $t$where s.origem = 'VENDA' and coalesce(s.v_forma, '') <> 'A_RECEBER'$t$,
    $t$or t.product_sale_id = s.product_sale_id or t.credito_vendido_id = s.credito_vendido_id)$t$],
  array[
    $t$where s.origem in ('VENDA', 'PLANO') and coalesce(s.v_forma, '') <> 'A_RECEBER'$t$,
    $t$or t.product_sale_id = s.product_sale_id or t.credito_vendido_id = s.credito_vendido_id
              or t.treatment_plan_id = s.treatment_plan_id)$t$],
  array[1, 1]);

-- A conferência: o plano passa a ter as MESMAS formas da venda — com a
-- maquininha de cada uma (`20261130100003`), que a tela escreve.
do $c$
begin
  if position($t$'maquininha', x.maquininha$t$ in pg_get_functiondef('public.pdv_comandas(uuid,uuid,text,timestamptz,timestamptz)'::regprocedure)) = 0 then
    raise exception 'pdv_comandas sem a maquininha nas formas: confira 20261130100003';
  end if;
end
$c$;

notify pgrst, 'reload schema';
