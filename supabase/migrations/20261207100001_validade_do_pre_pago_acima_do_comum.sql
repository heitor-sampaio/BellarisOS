-- A validade do pré-pago era de 1 a 3.650 dias, recusada acima. O Heitor, 25/11:
-- "Se não for impossível, ainda que improvável, pode ser feito." Acima de 3.650
-- (o antigo teto) a tela avisa e o servidor grava (lib/vendas/validade.ts). O
-- impossível (decisão do Claude, 25/11): zero e acima de 100 anos (36.500 dias),
-- porque a validade vira DATA e a conta da data estoura no banco.
--
-- Troca de trecho nos corpos VIVOS, com a conferência da contagem (o padrão de
-- 20261130100007). O create or replace mantém os grants (só o servidor).

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
  'public.procedimento_vender(uuid, uuid, uuid, uuid, uuid, integer, numeric, integer, jsonb, jsonb)'::regprocedure,
  array[$t$(p_validade_dias < 1 or p_validade_dias > 3650)$t$],
  array[$t$(p_validade_dias < 1 or p_validade_dias > 36500)$t$],
  array[1]
);

select pg_temp.trocar_no_corpo(
  'public.procedimento_vender_com_equipe(uuid, uuid, uuid, uuid, uuid, uuid, integer, numeric, integer, jsonb, jsonb)'::regprocedure,
  array[$t$(p_validade_dias < 1 or p_validade_dias > 3650)$t$],
  array[$t$(p_validade_dias < 1 or p_validade_dias > 36500)$t$],
  array[1]
);

notify pgrst, 'reload schema';
