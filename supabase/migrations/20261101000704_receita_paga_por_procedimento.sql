-- F7 (D3 da 5ª simulação): a "receita" por procedimento e por profissional é
-- a receita PAGA dos atendimentos — o que entrou pela regra única
-- (metrics_receitas_pagas) ligado a um atendimento (`appointment_id`), pelo
-- procedimento e pela profissional dele. Era a soma do PREÇO dos concluídos:
-- entrava o avulso concluído e não pago, a sessão de pacote/pré-pago já
-- vendida e o preço sem o desconto — "Receita bruta" ao lado do cartão de
-- receita, que é o pago. Pacote, pré-pago, plano e produto não são de um
-- atendimento e ficam fora daqui (estão no faturamento e nas Vendas).
--
-- As execuções seguem pelo eixo do atendimento (aconteceu_em); a receita, pelo
-- do pagamento (paid_at) — o procedimento pago no período sem execução nele
-- (concluído em outubro, pago em novembro) aparece com 0 execuções.

create or replace function public.metrics_top_procedures(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer DEFAULT 5, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(procedure_id uuid, procedure_name text, appointments bigint, revenue numeric, repeat_visits bigint, avg_rating numeric, rating_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  appt as (
    select a.procedure_id, a.client_id, a.price, a.procedure_rating
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED'
      and a.aconteceu_em between p_from and p_to
      and a.procedure_id is not null
      and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  per_client as (
    select ap.procedure_id, ap.client_id, count(*) as visits
    from appt ap where ap.client_id is not null
    group by ap.procedure_id, ap.client_id
  ),
  feitos as (
    select a.procedure_id, count(*) as n,
           avg(a.procedure_rating) filter (where a.procedure_rating is not null) as nota,
           count(*) filter (where a.procedure_rating is not null) as notas
    from appt a
    group by a.procedure_id
  ),
  pago as (
    select ap.procedure_id, sum(t.amount) as v
    from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
    join public.appointments ap on ap.id = t.appointment_id
    where ap.procedure_id is not null
    group by ap.procedure_id
  )
  select
    coalesce(f.procedure_id, g.procedure_id),
    p.name,
    coalesce(f.n, 0),
    coalesce(g.v, 0),
    coalesce((select sum(greatest(pc.visits - 1, 0)) from per_client pc
               where pc.procedure_id = coalesce(f.procedure_id, g.procedure_id)), 0)::bigint,
    f.nota,
    coalesce(f.notas, 0)
  from feitos f
  full join pago g on g.procedure_id = f.procedure_id
  join public.procedures p on p.id = coalesce(f.procedure_id, g.procedure_id)
  order by coalesce(f.n, 0) desc, coalesce(g.v, 0) desc
  limit p_limit;
$function$;

create or replace function public.metrics_top_professionals(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer DEFAULT 5, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(professional_id uuid, professional_name text, appointments bigint, revenue numeric, commission numeric, avg_rating numeric, rating_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  appt as (
    select a.id, a.professional_id, a.price, a.client_rating
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED'
      and a.aconteceu_em between p_from and p_to
      and a.professional_id is not null
      and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  feitos as (
    select a.professional_id, count(*) as n,
           avg(a.client_rating) filter (where a.client_rating is not null) as nota,
           count(*) filter (where a.client_rating is not null) as notas
    from appt a
    group by a.professional_id
  ),
  pago as (
    select ap.professional_id, sum(t.amount) as v
    from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
    join public.appointments ap on ap.id = t.appointment_id
    where ap.professional_id is not null
    group by ap.professional_id
  )
  select
    coalesce(f.professional_id, g.professional_id),
    u.name,
    coalesce(f.n, 0),
    coalesce(g.v, 0),
    coalesce((select sum(c.amount) from public.commissions c
               join scope s on s.id = c.branch_id
               where c.professional_id = coalesce(f.professional_id, g.professional_id)
                 and c.released_at between p_from and p_to), 0),
    f.nota,
    coalesce(f.notas, 0)
  from feitos f
  full join pago g on g.professional_id = f.professional_id
  join public.users u on u.id = coalesce(f.professional_id, g.professional_id)
  order by coalesce(f.n, 0) desc, coalesce(g.v, 0) desc
  limit p_limit;
$function$;

create or replace function public.metrics_receita_por_categoria_de_procedimento(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(categoria text, receita numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(pr.category, '—'), sum(t.amount)
  from public.metrics_receitas_pagas(p_tenant, p_branch_ids, p_from, p_to, p_professional_id) t
  join public.appointments a on a.id = t.appointment_id
  join public.procedures pr on pr.id = a.procedure_id
  group by 1;
$function$;

-- metrics_relatorio: só os dois blocos (por procedimento e por profissional),
-- a partir do corpo ATUAL da produção; e o total pago dos atendimentos, para a
-- tela não somar.
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
  'public.metrics_relatorio(uuid,uuid[],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid)',
  array[$de$      'por_procedimento', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'categoria', categoria, 'receita', receita, 'execucoes', n))
        from (select pr.name nome, coalesce(pr.category, '—') categoria, sum(coalesce(a.price, 0)) receita, count(*) n
              from public.appointments a join public.procedures pr on pr.id = a.procedure_id
              where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                and a.aconteceu_em between p_from and p_to
                and (p_professional_id is null or a.professional_id = p_professional_id)
              group by pr.name, pr.category) x
      ), '[]'::jsonb),
      'por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'receita', receita, 'atendimentos', n))
        from (select u.name nome, sum(coalesce(a.price, 0)) receita, count(*) n
              from public.appointments a join public.users u on u.id = a.professional_id
              where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                and a.aconteceu_em between p_from and p_to
                and (p_professional_id is null or a.professional_id = p_professional_id)
              group by u.name) x
      ), '[]'::jsonb)
$de$],
  array[$para$      'por_procedimento', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'categoria', categoria, 'receita', receita, 'execucoes', n))
        from (select coalesce(f.nome, g.nome) nome, coalesce(f.categoria, g.categoria) categoria,
                     coalesce(g.receita, 0) receita, coalesce(f.n, 0) n
              from (select pr.name nome, coalesce(pr.category, '—') categoria, count(*) n
                    from public.appointments a join public.procedures pr on pr.id = a.procedure_id
                    where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                      and a.aconteceu_em between p_from and p_to
                      and (p_professional_id is null or a.professional_id = p_professional_id)
                    group by pr.name, pr.category) f
              full join (
                    -- F7 (D3): a receita PAGA do atendimento, pela regra única.
                    select pr.name nome, coalesce(pr.category, '—') categoria, sum(t.amount) receita
                    from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) t
                    join public.appointments a on a.id = t.appointment_id
                    join public.procedures pr on pr.id = a.procedure_id
                    group by pr.name, pr.category) g on g.nome = f.nome and g.categoria = f.categoria) x
      ), '[]'::jsonb),
      'por_profissional', coalesce((
        select jsonb_agg(jsonb_build_object('nome', nome, 'receita', receita, 'atendimentos', n))
        from (select coalesce(f.nome, g.nome) nome, coalesce(g.receita, 0) receita, coalesce(f.n, 0) n
              from (select u.name nome, count(*) n
                    from public.appointments a join public.users u on u.id = a.professional_id
                    where a.branch_id = any (unidades) and a.status = 'COMPLETED'
                      and a.aconteceu_em between p_from and p_to
                      and (p_professional_id is null or a.professional_id = p_professional_id)
                    group by u.name) f
              full join (
                    select u.name nome, sum(t.amount) receita
                    from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) t
                    join public.appointments a on a.id = t.appointment_id
                    join public.users u on u.id = a.professional_id
                    group by u.name) g on g.nome = f.nome) x
      ), '[]'::jsonb),
      'receita_dos_atendimentos', coalesce((
        select sum(t.amount)
        from public.metrics_receitas_pagas(p_tenant, unidades, p_from, p_to, p_professional_id) t
        where t.appointment_id is not null
      ), 0)
$para$],
  array[1]);

notify pgrst, 'reload schema';
