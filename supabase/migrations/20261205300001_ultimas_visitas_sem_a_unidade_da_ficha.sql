-- D3 da 29ª simulação (2026-11-25): a "Última visita" de antes do sistema é da
-- REDE. `ultimas_visitas` recortava a visita de antes por `clients.branch_id`
-- quando recebia a unidade (`p_branch`) — CLAUDE.md §14: nada se decide por
-- clients.branch_id (é só onde a ficha nasceu; a cliente é da rede, H5/H16).
-- Os layouts de clientes passam nulo (a rede); quem passa a unidade vê os
-- atendimentos DELA e a visita de antes da cliente, que não tem unidade.
-- O fuso da visita de antes segue o da unidade em que a ficha nasceu (F62b):
-- é o único dia que a planilha deu, e não decide quem aparece.
-- Troca de trecho no corpo VIVO, com a conferência da contagem.

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
  'public.ultimas_visitas(uuid,uuid)'::regprocedure,
  array[$t$and (p_branch is null or c.branch_id = p_branch)$t$],
  array[$t$-- a visita de antes é da rede: sem recorte por clients.branch_id (D3 da 29ª)$t$],
  array[1]
);

-- O create or replace mantém dono e grants (service_role só, como antes).

notify pgrst, 'reload schema';
