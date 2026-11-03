-- r2-fin-04 (F13; o Heitor, 2026-11-03: "crie o gráfico"). O fluxo de caixa
-- dos PRÓXIMOS meses, mês a mês (Brasília), a partir do mês atual:
--   da_cliente   — o a receber da cliente: os lançamentos de receita em aberto
--                  (sem o estornado nem o estorno), pelo vencimento
--                  (`data_de_referencia`; sem vencimento, a criação);
--   da_operadora — o que a operadora do cartão ainda deposita
--                  (`recebiveis_do_cartao` vivos e não recebidos), pelo vencimento;
--   a_pagar      — as despesas em aberto, pelo vencimento;
--   saldo        — da_cliente + da_operadora − a_pagar.
-- O que já VENCEU e segue em aberto entra no mês atual (é o que falta entrar
-- ou sair agora). As mesmas definições do "A receber da cliente", do "A
-- receber da operadora" e do "A pagar" do Financeiro — só que por mês.

create or replace function public.metrics_fluxo_de_caixa(p_tenant uuid, p_branch_ids uuid[], p_meses integer default 6)
 returns table(mes date, da_cliente numeric, da_operadora numeric, a_pagar numeric, saldo numeric)
 language sql
 stable
 set search_path to ''
as $function$
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
    select date_trunc('month', r.vencimento at time zone 'America/Sao_Paulo')::date as mes, r.valor
      from public.recebiveis_do_cartao r
      join scope s on s.id = r.branch_id
     where r.tenant_id = p_tenant
       and r.cancelada_em is null and r.estornada_em is null
       and r.recebida_em is null and r.vencimento > now() and r.valor > 0
  )
  select m.mes,
         coalesce((select round(sum(l.amount), 2) from lancamentos l where l.mes = m.mes and l.tipo = 'INCOME'), 0),
         coalesce((select round(sum(o.valor), 2) from operadora o where o.mes = m.mes), 0),
         coalesce((select round(sum(l.amount), 2) from lancamentos l where l.mes = m.mes and l.tipo = 'EXPENSE'), 0),
         coalesce((select round(sum(l.amount), 2) from lancamentos l where l.mes = m.mes and l.tipo = 'INCOME'), 0)
           + coalesce((select round(sum(o.valor), 2) from operadora o where o.mes = m.mes), 0)
           - coalesce((select round(sum(l.amount), 2) from lancamentos l where l.mes = m.mes and l.tipo = 'EXPENSE'), 0)
    from meses m
   order by m.mes
$function$;

revoke execute on function public.metrics_fluxo_de_caixa(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.metrics_fluxo_de_caixa(uuid, uuid[], integer) to service_role;

notify pgrst, 'reload schema';
