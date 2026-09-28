-- Demografia e giro de estoque do dashboard da rede, agregados no Postgres.
--
-- O dashboard trazia TODOS os clientes da rede (e todos os movimentos de
-- consumo do período) num select e contava em JavaScript: faixas etárias, top
-- 5 cidades, clientes e LTV por CEP (mapa de calor), e o giro. O PostgREST
-- corta em 1000 linhas, então passando disso os quatro números subcontavam em
-- silêncio (CLAUDE.md §13.1).
--
-- O LTV por CEP NÃO repete a regra do dinheiro: reaproveita
-- `metrics_top_clients` (pago, sem estorno, eixo em paid_at) — a mesma que o
-- dashboard já usava. Duas cópias da definição divergem; é questão de quando.

create or replace function public.metrics_demografia(
  p_tenant     uuid,
  p_branch_ids uuid[],
  p_to         timestamptz
)
returns jsonb
language sql
stable
set search_path = ''
as $fn$
  with ativos as (
    select c.id, c.city, c.zip_code,
           -- Gravada como meia-noite: em UTC ela continua no dia certo.
           (c.birth_date at time zone 'UTC')::date as nascimento
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active
  ),
  idades as (
    select case
             when a.anos < 18 then '< 18'
             when a.anos <= 25 then '18–25'
             when a.anos <= 35 then '26–35'
             when a.anos <= 45 then '36–45'
             when a.anos <= 55 then '46–55'
             else '55+'
           end as faixa
    from (
      select extract(year from age((now() at time zone 'America/Sao_Paulo')::date, nascimento))::int as anos
      from ativos where nascimento is not null
    ) a
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
                         from (select faixa, count(*) as n from idades group by faixa) x), '[]'::jsonb),
    'cidades', coalesce((select jsonb_agg(jsonb_build_object('cidade', cidade, 'n', n) order by n desc, cidade)
                         from cidades), '[]'::jsonb),
    'ceps',    coalesce((select jsonb_agg(jsonb_build_object('cep', cep, 'n', n, 'ltv', ltv))
                         from ceps), '[]'::jsonb)
  );
$fn$;

-- Giro do período: consumo em procedimentos, ao custo do MOVIMENTO (o custo
-- atual do produto só quando o movimento não guardou o seu).
create or replace function public.metrics_giro_estoque(
  p_branch_ids uuid[],
  p_from       timestamptz,
  p_to         timestamptz
)
returns numeric
language sql
stable
set search_path = ''
as $fn$
  select coalesce(sum(abs(m.quantity) * coalesce(m.unit_cost, p.cost_price, 0)), 0)
  from public.stock_movements m
  left join public.products p on p.id = m.product_id
  where m.branch_id = any (p_branch_ids)
    and m.type = 'PROCEDURE_USAGE'
    and m.created_at between p_from and p_to;
$fn$;

revoke all on function public.metrics_demografia(uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_demografia(uuid, uuid[], timestamptz) to service_role;
revoke all on function public.metrics_giro_estoque(uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_giro_estoque(uuid[], timestamptz, timestamptz) to service_role;
