-- R08 (o Heitor, 26/11, na página de perguntas, sobre o porquê do estorno
-- parcial no cartão: "Não precisa dessa explicação."). A 20261210400001 pôs
-- "(a operadora não estorna só uma parte)" na recusa; a frase volta à de antes,
-- "No cartão, o estorno é do pagamento inteiro:", e o que fazer. Só o texto: a
-- regra (EX-06) não muda. Corpo vivo trocado por trecho, com a contagem. O
-- cancelamento do pacote e o do plano nunca o disseram: ficam como estão.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare d text := pg_get_functiondef(p_fn); i int; n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i]; end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

do $$
declare
  de   text := 'No cartão, o estorno é do pagamento inteiro (a operadora não estorna só uma parte):';
  para text := 'No cartão, o estorno é do pagamento inteiro:';
begin
  perform pg_temp.trocar_no_corpo('public.procedimento_cancelar_unidade_devolvendo(uuid,uuid,uuid,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
    array[de], array[para], array[1]);
  perform pg_temp.trocar_no_corpo('private.recebiveis_do_cartao_acompanham()'::regprocedure,
    array[de], array[para], array[1]);
  perform pg_temp.trocar_no_corpo('public.produto_devolver_itens(uuid,uuid,uuid,text,text,jsonb,boolean,text,numeric,boolean,text,jsonb)'::regprocedure,
    array[de], array[para], array[1]);
end $$;

notify pgrst, 'reload schema';
