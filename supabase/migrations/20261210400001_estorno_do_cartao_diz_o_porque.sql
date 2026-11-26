-- A recusa do estorno parcial no cartão diz o PORQUÊ (EX-06: "No cartão, a
-- operadora estorna o pagamento inteiro"; princípio 3). Até aqui as funções
-- que recusam diziam "No cartão, o estorno é do pagamento inteiro:" e o que
-- fazer, sem dizer por quê. O começo da frase fica (os E2E o conferem:
-- financeiro-cartao-a-receber-da-operadora e pacote-cancelar); entra o porquê.
-- Só o texto: a regra não muda. Corpo vivo trocado por trecho, com a contagem.
-- O cancelamento do pacote e o do plano dizem o mesmo e ficam como estão: o
-- teste comissoes-base-efetiva exige que a migration mais nova que os cita
-- seja a da comissão adiada (ou a das 12 vezes) — fica para o Heitor.

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
  de   text := 'No cartão, o estorno é do pagamento inteiro:';
  para text := 'No cartão, o estorno é do pagamento inteiro (a operadora não estorna só uma parte):';
begin
  perform pg_temp.trocar_no_corpo('public.procedimento_cancelar_unidade_devolvendo(uuid,uuid,uuid,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
    array[de], array[para], array[1]);
  perform pg_temp.trocar_no_corpo('private.recebiveis_do_cartao_acompanham()'::regprocedure,
    array[de], array[para], array[1]);
  perform pg_temp.trocar_no_corpo('public.produto_devolver_itens(uuid,uuid,uuid,text,text,jsonb,boolean,text,numeric,boolean,text,jsonb)'::regprocedure,
    array[de], array[para], array[1]);
end $$;

notify pgrst, 'reload schema';
