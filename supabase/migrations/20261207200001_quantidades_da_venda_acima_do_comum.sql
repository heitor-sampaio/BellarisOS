-- As quantidades do que se vende deixam de recusar acima do teto de antes.
--
-- O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
-- feito." Recusava-se: na venda de produto (`produto_vender_itens`), mais de 100
-- de cada produto, mais de 100 unidades e mais de 20 produtos; na comanda do PDV
-- (`comanda_acrescentar_item`), mais de 100 de cada e mais de 20 produtos; no
-- pré-pago (`procedimento_vender`, `procedimento_vender_com_equipe`), mais de
-- 100 sessões. E os CHECKs das colunas repetiam o 100.
--
-- Decisão do Claude, 25/11 (os mesmos números de apps/web/lib/vendas/quantidades.ts):
-- o "comum" é o antigo teto — acima dele a tela avisa e o servidor grava. O
-- impossível:
-- - a quantidade de cada produto e o total da venda: zero, negativo e acima do
--   registro (as colunas são `integer`). As somas se fazem em bigint, para o
--   acima do registro se recusar em português em vez de estourar ("integer out
--   of range"). O estoque já barra antes ("Estoque insuficiente…"): o saldo
--   cabe em numeric(10,4), e a baixa (`stock_movements.quantity`, também
--   numeric(10,4)) nunca passa dele;
-- - as sessões do pré-pago: cada uma vira UMA LINHA em `procedure_sale_units` —
--   até 32.767, como o crediário;
-- - o número de produtos: sem limite próprio. O laço é por produto e cada um
--   entra uma vez (somado): não passa do catálogo da rede.
--
-- A devolução de parte da venda (`produto_devolver_itens`) não tinha teto
-- próprio: ela recusa só o que passa do que a cliente ainda tem.
-- `produto_vender` (a de um produto só, sem chamador) vai junto, para não sobrar
-- o 100 em lugar nenhum.
--
-- Troca de trecho nos corpos VIVOS, com a conferência da contagem (o padrão de
-- 20261205200002). O create or replace mantém os grants (só o servidor).

alter table public.product_sales
  drop constraint if exists product_sales_quantity_check,
  add constraint product_sales_quantity_check check (quantity >= 1);
alter table public.product_sale_items
  drop constraint if exists product_sale_items_quantity_check,
  add constraint product_sale_items_quantity_check check (quantity >= 1);
alter table public.comanda_itens
  drop constraint if exists comanda_itens_quantidade_check,
  add constraint comanda_itens_quantidade_check check (quantidade >= 1);
alter table public.procedure_sales
  drop constraint if exists procedure_sales_quantity_check,
  add constraint procedure_sales_quantity_check check (quantity between 1 and 32767);

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

-- A venda de produto: sem o teto de 20 produtos, de 100 de cada e de 100 unidades.
select pg_temp.trocar_no_corpo(
  'public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure,
  array[
$t$  if jsonb_array_length(p_itens) > 20 then
    raise exception 'Uma venda leva até 20 produtos.' using errcode = 'P0001';
  end if;
$t$,
    $t$sum((x ->> 'quantity')::int)::int q$t$,
    $t$or (x ->> 'quantity')::int < 1 or (x ->> 'quantity')::int > 100) then$t$,
    $t$'Quantidade inválida (de 1 a 100 de cada produto).'$t$,
$t$  select coalesce(sum((x ->> 'quantity')::int), 0) into v_qtd_total from jsonb_array_elements(v_itens) x;
  if v_qtd_total > 100 then
    raise exception 'Uma venda leva até 100 unidades.' using errcode = 'P0001';
  end if;
$t$
  ],
  array[
    '',
    $t$sum((x ->> 'quantity')::bigint) q$t$,
    $t$or (x ->> 'quantity')::bigint < 1 or (x ->> 'quantity')::bigint > 2147483647) then$t$,
    $t$'Quantidade inválida: de 1 a 2.147.483.647 unidades de cada produto (o limite do registro).'$t$,
$t$  if (select coalesce(sum((x ->> 'quantity')::bigint), 0) from jsonb_array_elements(v_itens) x) > 2147483647 then
    raise exception 'No máximo 2.147.483.647 unidades numa venda (o limite do registro).' using errcode = 'P0001';
  end if;
  select coalesce(sum((x ->> 'quantity')::int), 0) into v_qtd_total from jsonb_array_elements(v_itens) x;
$t$
  ],
  array[1, 1, 1, 1, 1]);

-- A de um produto só (sem chamador).
select pg_temp.trocar_no_corpo(
  'public.produto_vender(uuid,uuid,uuid,uuid,uuid,integer,numeric,jsonb)'::regprocedure,
  array[
    $t$p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then$t$,
    $t$'Quantidade inválida (de 1 a 100).'$t$
  ],
  array[
    $t$p_quantidade is null or p_quantidade < 1 then$t$,
    $t$'Quantidade inválida: um número inteiro, a partir de 1.'$t$
  ],
  array[1, 1]);

-- A comanda do PDV: sem o teto de 100 de cada (somando o que já está nela) e de 20 produtos.
select pg_temp.trocar_no_corpo(
  'public.comanda_acrescentar_item(uuid,uuid,uuid,integer,uuid)'::regprocedure,
  array[
    $t$p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then$t$,
    $t$'Quantidade inválida (de 1 a 100).'$t$,
    $t$if v_ja + p_quantidade > 100 then$t$,
    $t$'Quantidade inválida (de 1 a 100 de cada produto).'$t$,
$t$  if v_ja = 0 and (select count(*) from public.comanda_itens i
                    where i.comanda_id = p_comanda and i.product_sale_id is null) >= 20 then
    raise exception 'Uma comanda leva até 20 produtos.' using errcode = 'P0001';
  end if;
$t$
  ],
  array[
    $t$p_quantidade is null or p_quantidade < 1 then$t$,
    $t$'Quantidade inválida: um número inteiro, a partir de 1.'$t$,
    $t$if v_ja::bigint + p_quantidade > 2147483647 then$t$,
    $t$'No máximo 2.147.483.647 unidades de cada produto (o limite do registro).'$t$,
    ''
  ],
  array[1, 1, 1, 1, 1]);

-- O pré-pago: até 32.767 sessões (uma linha por sessão).
select pg_temp.trocar_no_corpo(
  'public.procedimento_vender(uuid,uuid,uuid,uuid,uuid,integer,numeric,integer,jsonb,jsonb)'::regprocedure,
  array[
    $t$p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then$t$,
    $t$'Quantidade inválida (de 1 a 100).'$t$
  ],
  array[
    $t$p_quantidade is null or p_quantidade < 1 or p_quantidade > 32767 then$t$,
    $t$'Quantidade inválida: de 1 a 32.767 sessões (o limite do registro).'$t$
  ],
  array[1, 1]);

select pg_temp.trocar_no_corpo(
  'public.procedimento_vender_com_equipe(uuid,uuid,uuid,uuid,uuid,uuid,integer,numeric,integer,jsonb,jsonb)'::regprocedure,
  array[
    $t$p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then$t$,
    $t$'Quantidade inválida (de 1 a 100).'$t$
  ],
  array[
    $t$p_quantidade is null or p_quantidade < 1 or p_quantidade > 32767 then$t$,
    $t$'Quantidade inválida: de 1 a 32.767 sessões (o limite do registro).'$t$
  ],
  array[1, 1]);

notify pgrst, 'reload schema';
