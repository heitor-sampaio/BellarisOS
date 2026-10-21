-- A faixa etária é UMA (2026-10-21): metrics_demografia (o dashboard) contava
-- as próprias faixas (18–25, 26–35…) e metrics_relatorio usava
-- metrics_faixa_etaria (18–24, 25–34…) — a mesma cliente caía em "26–35" num
-- e "25–34" no outro (D33 da simulação de um dia de clínica). Agora as duas
-- usam metrics_faixa_etaria. O resto da função não muda.

create or replace function public.metrics_demografia(p_tenant uuid, p_branch_ids uuid[], p_to timestamptz)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with ativos as (
    select c.id, c.city, c.zip_code, c.birth_date
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
  ),
  idades as (
    select public.metrics_faixa_etaria(a.birth_date) as faixa
    from ativos a where a.birth_date is not null
  ),
  cidades as (
    select city as cidade, count(*) as n
    from ativos where city is not null and city <> ''
    group by city order by n desc, city limit 5
  ),
  ltv as (
    select t.client_id, t.total_spent
    from public.metrics_top_clients(p_tenant, p_branch_ids, '2000-01-01'::timestamptz, p_to, 2147483647) t
  ),
  ceps as (
    select regexp_replace(a.zip_code, '\D', '', 'g') as cep,
           count(*) as n,
           coalesce(sum(l.total_spent), 0) as ltv
    from ativos a
    left join ltv l on l.client_id = a.id
    where length(regexp_replace(coalesce(a.zip_code, ''), '\D', '', 'g')) = 8
    group by 1
  )
  select jsonb_build_object(
    'idades',  coalesce((select jsonb_agg(jsonb_build_object('faixa', faixa, 'n', n))
                         from (select faixa, count(*) as n from idades where faixa is not null group by faixa) x), '[]'::jsonb),
    'cidades', coalesce((select jsonb_agg(jsonb_build_object('cidade', cidade, 'n', n) order by n desc, cidade)
                         from cidades), '[]'::jsonb),
    'ceps',    coalesce((select jsonb_agg(jsonb_build_object('cep', cep, 'n', n, 'ltv', ltv))
                         from ceps), '[]'::jsonb)
  );
$function$;

notify pgrst, 'reload schema';
