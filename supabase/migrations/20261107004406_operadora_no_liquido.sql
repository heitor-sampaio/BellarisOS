-- A30 da 9ª simulação (2026-11-07; decidido pelo princípio 3): o cartão "A
-- receber da operadora" e o fluxo de caixa somavam o BRUTO das parcelas,
-- enquanto a lista mostrava o líquido (R$ 2.386,82 × R$ 2.289,47). O que a
-- operadora deposita é o LÍQUIDO: os dois passam a contar o líquido, com o
-- bruto ao lado. É a mesma conta das funções de antes
-- (`metrics_a_receber_da_operadora`, `metrics_fluxo_de_caixa`, que ficam como
-- estavam — trocar o tipo de retorno pediria apagá-las), com o líquido de cada
-- parcela (`recebiveis_do_cartao.liquido`, nunca abaixo de zero nem acima do
-- que a operadora ainda deve, como na lista — F16-3).

create or replace function public.metrics_a_receber_da_operadora_liquido(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz
) returns table(
  branch_id uuid, a_receber numeric, a_receber_bruto numeric, recebido numeric,
  em_aberto numeric, em_aberto_bruto numeric, proximo_dia date, proximo_valor numeric, proximo_bruto numeric
)
language sql
stable
set search_path to ''
as $$
  with p as (
    select r.branch_id, r.valor, r.estornado, r.vencimento,
           least(greatest(coalesce(r.liquido, r.valor - coalesce(r.taxa, 0)), 0), r.valor) liquido,
           (r.vencimento at time zone 'America/Sao_Paulo')::date dia,
           r.cancelada_em is null and r.estornada_em is null vivo,
           (r.recebida_em is not null or r.vencimento <= now()) recebida,
           coalesce(r.recebida_em, r.vencimento) recebida_na
      from public.recebiveis_do_cartao r
     where r.tenant_id = p_tenant
       and (p_branch_ids is null or r.branch_id = any (p_branch_ids))
  ),
  aberto as (select * from p where vivo and not recebida),
  grupos as (
    select x.branch_id from (select distinct p.branch_id from p) x
    union all select null::uuid
  ),
  proximo as (
    select g.branch_id, min(a.dia) dia
      from grupos g join aberto a on (g.branch_id is null or a.branch_id = g.branch_id) and a.vencimento > p_to
     group by g.branch_id
  )
  select g.branch_id,
         coalesce((select round(sum(a.liquido), 2) from aberto a
                    where (g.branch_id is null or a.branch_id = g.branch_id) and a.vencimento between p_from and p_to), 0),
         coalesce((select round(sum(a.valor), 2) from aberto a
                    where (g.branch_id is null or a.branch_id = g.branch_id) and a.vencimento between p_from and p_to), 0),
         -- Recebido no período (o líquido do que entrou: o vivo e o depois estornado).
         coalesce((select round(sum(x.liquido), 2) from p x
                    where x.recebida and (x.vivo or x.estornado > 0)
                      and (g.branch_id is null or x.branch_id = g.branch_id) and x.recebida_na between p_from and p_to), 0),
         coalesce((select round(sum(a.liquido), 2) from aberto a where g.branch_id is null or a.branch_id = g.branch_id), 0),
         coalesce((select round(sum(a.valor), 2) from aberto a where g.branch_id is null or a.branch_id = g.branch_id), 0),
         pr.dia,
         (select round(sum(a.liquido), 2) from aberto a
           where (g.branch_id is null or a.branch_id = g.branch_id) and a.dia = pr.dia and a.vencimento > p_to),
         (select round(sum(a.valor), 2) from aberto a
           where (g.branch_id is null or a.branch_id = g.branch_id) and a.dia = pr.dia and a.vencimento > p_to)
    from grupos g
    left join proximo pr on pr.branch_id is not distinct from g.branch_id
$$;

create or replace function public.metrics_fluxo_de_caixa_liquido(p_tenant uuid, p_branch_ids uuid[], p_meses integer default 6)
returns table(mes date, da_cliente numeric, da_operadora numeric, da_operadora_bruto numeric, a_pagar numeric, saldo numeric)
language sql
stable
set search_path to ''
as $$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  inicio as (
    select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as m0
  ),
  meses as (
    select (i.m0 + make_interval(months => k))::date as mes
      from inicio i, generate_series(0, greatest(least(coalesce(p_meses, 6), 24), 1) - 1) k
  ),
  lancamentos as (
    select greatest(date_trunc('month', coalesce(f.data_de_referencia, f.created_at) at time zone 'America/Sao_Paulo')::date, i.m0) as mes,
           f.type::text as tipo, f.amount
      from public.financial_transactions f
      join scope s on s.id = f.branch_id
      cross join inicio i
     where not f.is_paid and f.amount > 0
       and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno'
  ),
  operadora as (
    select date_trunc('month', r.vencimento at time zone 'America/Sao_Paulo')::date as mes, r.valor,
           least(greatest(coalesce(r.liquido, r.valor - coalesce(r.taxa, 0)), 0), r.valor) as liquido
      from public.recebiveis_do_cartao r
      join scope s on s.id = r.branch_id
     where r.tenant_id = p_tenant
       and r.cancelada_em is null and r.estornada_em is null
       and r.recebida_em is null and r.vencimento > now() and r.valor > 0
  )
  select m.mes,
         coalesce((select round(sum(l.amount), 2) from lancamentos l where l.mes = m.mes and l.tipo = 'INCOME'), 0),
         coalesce((select round(sum(o.liquido), 2) from operadora o where o.mes = m.mes), 0),
         coalesce((select round(sum(o.valor), 2) from operadora o where o.mes = m.mes), 0),
         coalesce((select round(sum(l.amount), 2) from lancamentos l where l.mes = m.mes and l.tipo = 'EXPENSE'), 0),
         coalesce((select round(sum(l.amount), 2) from lancamentos l where l.mes = m.mes and l.tipo = 'INCOME'), 0)
           + coalesce((select round(sum(o.liquido), 2) from operadora o where o.mes = m.mes), 0)
           - coalesce((select round(sum(l.amount), 2) from lancamentos l where l.mes = m.mes and l.tipo = 'EXPENSE'), 0)
    from meses m
   order by m.mes
$$;

revoke execute on function public.metrics_a_receber_da_operadora_liquido(uuid, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_a_receber_da_operadora_liquido(uuid, uuid[], timestamptz, timestamptz) to service_role;
revoke execute on function public.metrics_fluxo_de_caixa_liquido(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.metrics_fluxo_de_caixa_liquido(uuid, uuid[], integer) to service_role;

notify pgrst, 'reload schema';
