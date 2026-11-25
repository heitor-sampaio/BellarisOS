-- A12 da 29ª simulação (2026-11-25; princípio 7, um nome só): o uso do produto
-- se chama "Venda direta" no cadastro (lib/estoque/uso.ts, o Heitor, 13/11:
-- "checkbox de onde o produto está disponivel (Insumo e Venda direta)"), e a
-- recusa da venda de produto dizia "não é de revenda". A recusa passa a dizer
-- o mesmo que a da comanda (`comanda_acrescentar_item`): "não é de Venda
-- direta". Só o texto; a conta não muda.
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
  'public.produto_vender_itens(uuid,uuid,uuid,uuid,uuid,jsonb,numeric,jsonb)'::regprocedure,
  array[$t$'% não é de revenda: marque o uso e o preço de venda no cadastro.'$t$],
  array[$t$'% não é de Venda direta: marque o uso e o preço de venda no cadastro.'$t$],
  array[1]);

-- A de um produto só (nada a chama — vendas-financeiro.md, "O que nunca fazer
-- aqui"), para não sobrar a palavra em lugar nenhum.
select pg_temp.trocar_no_corpo(
  'public.produto_vender(uuid,uuid,uuid,uuid,uuid,integer,numeric,jsonb)'::regprocedure,
  array[$t$'Este produto não é de revenda: marque o uso e o preço de venda no cadastro.'$t$],
  array[$t$'Este produto não é de Venda direta: marque o uso e o preço de venda no cadastro.'$t$],
  array[1]);

notify pgrst, 'reload schema';
