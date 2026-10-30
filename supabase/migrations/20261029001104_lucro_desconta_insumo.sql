-- O lucro desconta o insumo consumido (decisão do Heitor, 2026-10-29: o
-- consumo "serve pra controle de estoque e aferimento de métricas de
-- custo/margem/lucro"). A despesa de COMPRA DE ESTOQUE conta no caixa (o que
-- saiu) e NÃO no lucro: senão o produto seria descontado duas vezes, na
-- compra e no consumo. A movimentação do estoque segue sem gerar despesa.
--
--   lucro = receita paga − (despesa paga − compra de estoque paga) − insumo consumido
--
-- (a conta é de lib/metrics/resultado.ts; aqui só as duas parcelas novas.)
--
-- - compra de estoque: EXPENSE paga, sem estorno dos dois lados (o predicado
--   de metrics_core.expenses_cash), da categoria "Compra de estoque" — e da
--   "Estoque", a que a Entrada do estoque gravava até 2026-10-28 (estoque_compra,
--   que saiu), para a compra antiga também não ser descontada duas vezes.
--   Com p_professional_id ("só os meus" do financeiro): a transação ligada a
--   um atendimento dela — a compra não é, então é zero (como a despesa).
-- - insumo consumido: o consumo dos atendimentos (PROCEDURE_USAGE) ao custo do
--   MOVIMENTO (`custo_do_movimento`, o custo de consumo gravado na baixa) — a
--   conta de metrics_giro_estoque. O lote não guarda custo próprio.
--
-- metrics_resultado: por unidade e o total (branch_id nulo).
-- metrics_series_do_resultado: as mesmas parcelas por fatia (o gráfico de
-- evolução, que desenha o lucro), no fuso do negócio.
-- Funções novas, só service_role.

create or replace function public.metrics_resultado(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns table(branch_id uuid, compra_de_estoque numeric, consumo_de_insumo numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  parcelas as (
    select t.branch_id, t.amount as compra, 0::numeric as consumo
      from public.financial_transactions t
      join scope s on s.id = t.branch_id
     where t.type = 'EXPENSE' and t.is_paid
       and coalesce(t.notes, '')    <> 'Estornada'
       and coalesce(t.category, '') <> 'Estorno'
       and lower(btrim(coalesce(t.category, ''))) in ('compra de estoque', 'estoque')
       and coalesce(t.paid_at, t.created_at) between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = t.appointment_id and a.professional_id = p_professional_id))
    union all
    select m.branch_id, 0::numeric, public.custo_do_movimento(m, p)
      from public.stock_movements m
      join scope s on s.id = m.branch_id
      left join public.products p on p.id = m.product_id
     where m.type = 'PROCEDURE_USAGE'
       and m.created_at between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = m.appointment_id and a.professional_id = p_professional_id))
  )
  select x.branch_id, coalesce(sum(x.compra), 0), coalesce(sum(x.consumo), 0)
    from parcelas x
   group by grouping sets ((x.branch_id), ())
$function$;

create or replace function public.metrics_series_do_resultado(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_granularity text default 'day'::text, p_professional_id uuid default null)
 returns table(bucket timestamp with time zone, compra_de_estoque numeric, consumo_de_insumo numeric)
 language sql
 stable
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  gran as (
    select case when p_granularity in ('hour', 'day', 'week', 'month') then p_granularity else 'day' end as g
  ),
  parcelas as (
    select date_trunc((select g from gran), coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as bucket,
           t.amount as compra, 0::numeric as consumo
      from public.financial_transactions t
      join scope s on s.id = t.branch_id
     where t.type = 'EXPENSE' and t.is_paid
       and coalesce(t.notes, '')    <> 'Estornada'
       and coalesce(t.category, '') <> 'Estorno'
       and lower(btrim(coalesce(t.category, ''))) in ('compra de estoque', 'estoque')
       and coalesce(t.paid_at, t.created_at) between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = t.appointment_id and a.professional_id = p_professional_id))
    union all
    select date_trunc((select g from gran), m.created_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, public.custo_do_movimento(m, p)
      from public.stock_movements m
      join scope s on s.id = m.branch_id
      left join public.products p on p.id = m.product_id
     where m.type = 'PROCEDURE_USAGE'
       and m.created_at between p_from and p_to
       and (p_professional_id is null or exists (
             select 1 from public.appointments a
              where a.id = m.appointment_id and a.professional_id = p_professional_id))
  )
  select x.bucket, coalesce(sum(x.compra), 0), coalesce(sum(x.consumo), 0)
    from parcelas x
   group by x.bucket
   order by x.bucket
$function$;

revoke all on function public.metrics_resultado(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.metrics_series_do_resultado(uuid, uuid[], timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.metrics_resultado(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_series_do_resultado(uuid, uuid[], timestamptz, timestamptz, text, uuid) to service_role;

notify pgrst, 'reload schema';
