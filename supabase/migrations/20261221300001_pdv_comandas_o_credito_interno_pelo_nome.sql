-- A4 da 42ª simulação (princípio 7; CI-10 do catálogo: "Nas telas da equipe, o
-- crédito da cliente se chama Crédito interno"): a lista do PDV chamava a venda de
-- crédito de "Crédito na rede" — a descrição da comanda vem de `pdv_comandas`, e o
-- resto do sistema (o Vender, a forma de pagamento, as Vendas, a ficha) diz
-- "Crédito interno". A trava do vocabulário (`tests/vocabulario-no-texto.test.ts`)
-- lia só o TypeScript; agora lê também o SQL.
--
-- Troca de texto sobre o corpo VIVO de `pdv_comandas` (o de 20261121000001 com as
-- trocas de 20261122600001, 20261130100003, 20261202200001 e 20261205200001,
-- conferido na produção em 28/11: o trecho aparece uma vez); a migration para se a
-- contagem não bater.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

select pg_temp.trocar_no_corpo(
  'public.pdv_comandas(uuid,uuid,text,timestamptz,timestamptz)'::regprocedure,
  array[
    $t$then 'Crédito na rede'$t$
  ],
  array[
    $t$then 'Crédito interno'$t$
  ],
  array[1]);

-- A conferência: o resto do corpo segue o de antes — as formas com a maquininha
-- (`20261130100003`), as da venda e do plano no crediário (`20261202200001`) e a
-- venda de produto devolvida em parte valendo o que ficou (`20261205200001`, que
-- tirou o valor inteiro da venda).
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
  if position($t$ps.price - coalesce(ps.valor_devolvido, 0)$t$ in v_def) = 0
     or position($t$when 'VENDA' then coalesce(s.v_valor, 0)$t$ in v_def) > 0 then
    raise exception 'pdv_comandas sem o devolvido na venda de produto: confira 20261205200001';
  end if;
  if position($t$then 'Crédito interno'$t$ in v_def) = 0 then
    raise exception 'pdv_comandas sem o nome "Crédito interno" na venda de crédito';
  end if;
end
$c$;

notify pgrst, 'reload schema';
