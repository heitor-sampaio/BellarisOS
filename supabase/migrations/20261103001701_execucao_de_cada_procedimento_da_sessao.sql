-- F16-1 (F17; o Heitor, revisão das decisões da F16, 2026-11-03: "não faz
-- sentido ter 0 execuções e ter um valor, se não tem execução não tem valor").
-- Desde a r4-f15-03 (migration 20261103001601) a sessão de PLANO vendido soma
-- cada procedimento dela no SEU procedimento, mas as EXECUÇÕES seguiam o
-- atendimento: sessão Botox R$ 800 + Preenchimento R$ 1.200, atendimento
-- marcado "Botox" → Botox 1 execução R$ 800, Preenchimento 0 execuções
-- R$ 1.200. Agora CADA procedimento da sessão conta a SUA execução, no dia da
-- sessão (Botox 1 · R$ 800, Preenchimento 1 · R$ 1.200).
--
-- A régua é UMA, `metrics_procedimentos_executados(atendimento, procedimento)`:
-- os procedimentos da sessão do plano vendido (ACCEPTED/COMPLETED — o mesmo
-- recorte da receita) ligada ao atendimento, um por linha da sessão; sem
-- sessão de plano vendido, o procedimento do atendimento. Vale em:
-- - metrics_top_procedures: as execuções e a recorrência (visitas da cliente
--   por procedimento); a NOTA continua do procedimento do atendimento (a
--   avaliação é do atendimento — não se copia para os outros);
-- - metrics_relatorio: a tabela por procedimento (execuções), o volume por
--   faixa etária e o novo `execucoes_total` / `execucoes_total_anterior` da aba
--   Procedimentos (o "Total Execuções", que era o número de ATENDIMENTOS do
--   núcleo e deixaria de fechar com a soma da tabela).
-- O que não muda: o ranking e a tabela por PROFISSIONAL contam ATENDIMENTOS (a
-- sessão é um atendimento: +1, com os R$ 2.000), a receita, o total da tela, a
-- margem por faixa (preço do atendimento) e o "Meu faturamento".
--
-- Troca de texto sobre o corpo ATUAL da produção, conferindo quantas vezes
-- cada trecho aparece.

create or replace function public.metrics_procedimentos_executados(p_appointment uuid, p_procedure uuid)
returns table (procedure_id uuid)
language sql
stable
set search_path to ''
as $$
  select sp.procedure_id
    from public.treatment_plan_sessions s
    join public.treatment_plans tp on tp.id = s.plan_id and tp.status in ('ACCEPTED', 'COMPLETED')
    join public.treatment_plan_session_procedures sp on sp.session_id = s.id
   where s.appointment_id = p_appointment and sp.procedure_id is not null
  union all
  select p_procedure
   where p_procedure is not null
     and not exists (
       select 1
         from public.treatment_plan_sessions s
         join public.treatment_plans tp on tp.id = s.plan_id and tp.status in ('ACCEPTED', 'COMPLETED')
         join public.treatment_plan_session_procedures sp on sp.session_id = s.id
        where s.appointment_id = p_appointment and sp.procedure_id is not null)
$$;

revoke execute on function public.metrics_procedimentos_executados(uuid, uuid) from public, anon, authenticated;
grant execute on function public.metrics_procedimentos_executados(uuid, uuid) to service_role;

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

-- O ranking de procedimentos do dashboard.
select pg_temp.trocar_no_corpo(
  'public.metrics_top_procedures(uuid,uuid[],timestamptz,timestamptz,integer,uuid)',
  array[
    E'    select a.procedure_id, a.client_id, a.price, a.procedure_rating\n',
    E'  per_client as (\n    select ap.procedure_id, ap.client_id, count(*) as visits\n    from appt ap where ap.client_id is not null\n    group by ap.procedure_id, ap.client_id\n  ),\n  feitos as (\n    select a.procedure_id, count(*) as n,\n           avg(a.procedure_rating) filter (where a.procedure_rating is not null) as nota,\n           count(*) filter (where a.procedure_rating is not null) as notas\n    from appt a\n    group by a.procedure_id\n  ),\n',
    E'    f.nota,\n    coalesce(f.notas, 0)\n  from feitos f\n  full join pago g on g.procedure_id = f.procedure_id\n'
  ],
  array[
    E'    select a.id, a.procedure_id, a.client_id, a.price, a.procedure_rating\n',
    E'  -- F16-1: cada procedimento executado — a sessão do plano vendido, um por procedimento dela.\n  execs as (\n    select ap.id as appointment_id, ap.client_id, e.procedure_id\n    from appt ap\n    cross join lateral public.metrics_procedimentos_executados(ap.id, ap.procedure_id) e\n  ),\n  per_client as (\n    select x.procedure_id, x.client_id, count(distinct x.appointment_id) as visits\n    from execs x where x.client_id is not null\n    group by x.procedure_id, x.client_id\n  ),\n  feitos as (\n    select x.procedure_id, count(*) as n\n    from execs x\n    group by x.procedure_id\n  ),\n  -- A nota é do atendimento: fica no procedimento dele.\n  notas as (\n    select a.procedure_id,\n           avg(a.procedure_rating) filter (where a.procedure_rating is not null) as nota,\n           count(*) filter (where a.procedure_rating is not null) as notas\n    from appt a\n    group by a.procedure_id\n  ),\n',
    E'    nt.nota,\n    coalesce(nt.notas, 0)\n  from feitos f\n  full join pago g on g.procedure_id = f.procedure_id\n  left join notas nt on nt.procedure_id = coalesce(f.procedure_id, g.procedure_id)\n'
  ],
  array[1, 1, 1]);

-- Os Relatórios: a tabela por procedimento, o volume por faixa e o total de execuções.
select pg_temp.trocar_no_corpo(
  'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)',
  array[
    E'count(*) n\n                    from public.appointments a join public.procedures pr on pr.id = a.procedure_id\n',
    E'      volume as (\n',
    E'        from feitos group by 1, 2\n',
    E'        ''tem_custos'', exists (select 1 from custo),\n'
  ],
  array[
    E'count(*) n\n                    from public.appointments a\n                    cross join lateral public.metrics_procedimentos_executados(a.id, a.procedure_id) e\n                    join public.procedures pr on pr.id = e.procedure_id\n',
    E'      -- F16-1: cada procedimento executado (a sessão do plano vendido, um por procedimento dela).\n      executados as (\n        select pr.name nome, public.metrics_faixa_etaria(c.birth_date) faixa\n        from public.appointments a\n        cross join lateral public.metrics_procedimentos_executados(a.id, a.procedure_id) e\n        join public.procedures pr on pr.id = e.procedure_id\n        left join public.clients c on c.id = a.client_id\n        where a.branch_id = any (unidades) and a.status = ''COMPLETED''\n          and a.aconteceu_em between p_from and p_to\n          and (p_professional_id is null or a.professional_id = p_professional_id)\n      ),\n      volume as (\n',
    E'        from executados group by 1, 2\n',
    E'        ''tem_custos'', exists (select 1 from custo),\n        ''execucoes_total'', (select count(*) from executados),\n        ''execucoes_total_anterior'', (\n          select count(*)\n          from public.appointments a\n          cross join lateral public.metrics_procedimentos_executados(a.id, a.procedure_id) e\n          where a.branch_id = any (unidades) and a.status = ''COMPLETED''\n            and a.aconteceu_em between p_prev_from and p_prev_to\n            and (p_professional_id is null or a.professional_id = p_professional_id)),\n'
  ],
  array[1, 1, 1, 1]);

notify pgrst, 'reload schema';
