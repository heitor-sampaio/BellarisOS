-- F7 (eq-02, revisão de 2026-11-02: "mudar"): "cliente dela" tem UMA regra
-- só, a do dashboard — o agendamento CANCELADO com ela não faz a cliente ser
-- dela (a falta faz). Os documentos emitidos com o prontuário "só os meus"
-- (documentos_emitidos_pagina e _resumo) contavam qualquer agendamento. A
-- partir do corpo ATUAL da produção. (O app: lib/clientes/atendida-por.ts e
-- listarPlanejamentos.)

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

select pg_temp.trocar_no_corpo(f::regprocedure,
  array['where ap.client_id = v.cliente_id and ap.professional_id = p_professional_id'],
  array[$p$where ap.client_id = v.cliente_id and ap.professional_id = p_professional_id and ap.status <> 'CANCELLED'$p$],
  array[1])
from unnest(array[
  'public.documentos_emitidos_pagina(uuid,uuid[],timestamptz,timestamptz,uuid,text,text,text,integer,integer)',
  'public.documentos_emitidos_resumo(uuid,uuid[],timestamptz,timestamptz,uuid)'
]) as f;

notify pgrst, 'reload schema';
