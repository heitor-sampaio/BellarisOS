-- A8 da 41ª simulação (2026-11-28, princípio 7): o crédito interno que fica do
-- cancelamento saía "Cancelamento do pacote Pacote Drenagem 5 sessões (4
-- sessões)" — o nome do pacote já começa com "Pacote". O nome vai entre aspas,
-- como o sistema já escreve os nomes ("Voucher “X”", "Plano “X”"): o pacote e o
-- plano. R43 (o Heitor, 28/11: "Pode corrigir, e o teste aceita a troca de
-- trecho (a proposta)"). Só a descrição do crédito novo; o que já foi gravado
-- fica como está. Não toca no cálculo de nada: só o texto.
--
-- Troca de trecho no corpo VIVO das duas funções (pg_get_functiondef), com a
-- conferência da contagem (uma vez cada), como em 20261130100007.

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
end $f$;

select pg_temp.trocar_no_corpo(
  'public.pacote_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[$t$'Cancelamento do pacote ' || coalesce(v_nome, '') || ' ('$t$],
  array[$t$'Cancelamento do pacote “' || coalesce(v_nome, '') || '” ('$t$],
  array[1]
);

select pg_temp.trocar_no_corpo(
  'public.plano_cancelar_devolvendo(uuid,uuid,uuid,text,text,text,text,numeric,boolean,text,jsonb)'::regprocedure,
  array[$t$'Cancelamento do plano ' || v_nome || ' ('$t$],
  array[$t$'Cancelamento do plano “' || v_nome || '” ('$t$],
  array[1]
);

notify pgrst, 'reload schema';
