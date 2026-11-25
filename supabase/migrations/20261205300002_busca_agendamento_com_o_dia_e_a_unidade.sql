-- D5 da 29ª simulação (2026-11-25; decisão do Claude, busca:AL-01 e o
-- princípio 7): o agendamento achado na busca por quem tem a Agenda e não o
-- Atendimento leva à AGENDA no dia dele, com ele aberto — a tela do
-- atendimento pede o Atendimento em Ver. Para isso o resultado traz o dia do
-- agendamento no fuso da unidade (o dia que a agenda abre) e a unidade (o
-- `?unidade=` da agenda da rede).
-- O trecho trocado inclui o filtro dos em aberto (D17 da 25ª), sem mudá-lo.
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
  'public.busca_universal(uuid,text,text[],uuid,uuid,uuid,integer)'::regprocedure,
  array[
    $t$'unidade',      b.name)
   from public.appointments a$t$,
    $t$and a.status::text in ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')$t$
  ],
  array[
    $t$'unidade',      b.name,
            'unidade_id',   b.id,
            'dia',          to_char(a.scheduled_at at time zone b.fuso, 'YYYY-MM-DD'))
   from public.appointments a$t$,
    $t$and a.status::text in ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')$t$
  ],
  array[1, 1]
);

-- O create or replace mantém dono e grants (service_role só, como antes).

notify pgrst, 'reload schema';
