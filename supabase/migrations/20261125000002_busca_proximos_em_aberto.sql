-- D17 da 25ª simulação: os "Próximos agendamentos" da busca são os EM ABERTO.
--
-- A busca acha o "próximo agendamento" (docs/regras/busca.md), e "próximo" é
-- uma regra só: em aberto (agendado, confirmado, já chegou, em atendimento) e
-- de hoje em diante — o de hoje fica até a conclusão (`STATUS_DO_PROXIMO`,
-- lib/clientes/agenda-do-portal.ts; docs/regras/atendimento.md). A busca só
-- tirava o cancelado: a falta e o concluído de hoje apareciam como
-- "próximos" (princípio 3). O dia já é o da unidade (20261111006203).

create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
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
  'public.busca_universal(uuid,text,text[],uuid,uuid,uuid,integer)'::regprocedure,
  array[$t$a.status::text <> 'CANCELLED'$t$],
  array[$t$a.status::text in ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')$t$],
  array[1]);

notify pgrst, 'reload schema';
