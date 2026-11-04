-- O lucro desconta as TAXAS DA MAQUININHA e as COMISSÕES (decisão do Heitor,
-- 2026-11-04, a pergunta da 6ª simulação: "pode descontar as duas").
--
-- Até aqui: lucro = receita paga − (despesa paga − compra de estoque) − insumo
-- consumido (2026-10-29). Passa a descontar também:
--
-- * as TAXAS DA MAQUININHA — as mesmas que o Fechamento do dia mostra, no dia
--   em que a receita entrou (o conjunto de `metrics_receitas_pagas`): a taxa
--   GRAVADA nas parcelas da operadora (`recebiveis_do_cartao.taxa`, o crédito
--   de 1x a 12x, com a sobra do arredondamento na última — D13/D4) e, sem
--   parcelas (o débito, o Pix e as vendas no cartão de antes), o recebimento ×
--   a taxa da configuração (`private.comissao_taxa_pct`, a conta de
--   `metrics_avisos_do_fechamento`);
-- * as COMISSÕES LANÇADAS no período (`commissions.released_at`, a conta de
--   Financeiro → Comissões e de `metrics_core`).
--
-- Sem contar duas vezes: o "Fechar e pagar" (`comissao_fechar`) lança a despesa
-- PAGA da categoria "Comissões" — ela fica no CAIXA e SAI das despesas do
-- lucro, como a "Compra de estoque" (a comissão entrou quando foi lançada).
-- Ex.: R$ 100 de comissão lançados em outubro e pagos em novembro descontam
-- R$ 100 do lucro de OUTUBRO; a despesa de novembro fica só no caixa.
--
-- Funções NOVAS (as de antes, `metrics_resultado` e
-- `metrics_series_do_resultado`, ficam como estão: mudar o retorno delas
-- exigiria apagá-las). SECURITY DEFINER pela `private.comissao_taxa_pct`
-- (o schema `private` não dá `usage` ao service_role — convencoes.md), e por
-- isso fechadas a public/anon/authenticated: recebem a rede por parâmetro.

create or replace function public.metrics_custos_da_venda(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz, p_professional_id uuid default null
)
 returns table(branch_id uuid, taxas_da_maquininha numeric, comissoes numeric, despesa_de_comissoes numeric)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  parcelas as (
    -- As taxas: a gravada nas parcelas da operadora; sem elas, a da configuração.
    select r.branch_id,
           coalesce(
             (select sum(rc.taxa) from public.recebiveis_do_cartao rc where rc.transaction_id = r.id),
             case when r.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                  then round(r.amount * private.comissao_taxa_pct(p_tenant, r.payment_method::text,
                         coalesce(r.cartao_vezes, r.parcela_total, 1), r.cartao_bandeira) / 100, 2)
                  else 0 end
           ) as taxa,
           0::numeric as comissao, 0::numeric as despesa
      from public.metrics_receitas_pagas(p_tenant, coalesce((select array_agg(id) from scope), '{}'::uuid[]), p_from, p_to, p_professional_id) r
     where r.amount <> 0
    union all
    -- As comissões LANÇADAS no período (o extrato: liberação, ajuste, estorno).
    select c.branch_id, 0::numeric, c.amount, 0::numeric
      from public.commissions c
      join scope s on s.id = c.branch_id
     where c.released_at between p_from and p_to
       and (p_professional_id is null or c.professional_id = p_professional_id)
    union all
    -- A despesa paga do fechamento das comissões: fica no caixa, sai do lucro.
    select t.branch_id, 0::numeric, 0::numeric, t.amount
      from public.financial_transactions t
      join scope s on s.id = t.branch_id
     where t.type = 'EXPENSE' and t.is_paid
       and coalesce(t.notes, '')    <> 'Estornada'
       and coalesce(t.category, '') <> 'Estorno'
       and lower(btrim(coalesce(t.category, ''))) = 'comissões'
       and coalesce(t.paid_at, t.created_at) between p_from and p_to
       and p_professional_id is null
  )
  select x.branch_id, coalesce(sum(x.taxa), 0), coalesce(sum(x.comissao), 0), coalesce(sum(x.despesa), 0)
    from parcelas x
   group by grouping sets ((x.branch_id), ())
$function$;

create or replace function public.metrics_series_dos_custos_da_venda(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz,
  p_granularity text default 'day', p_professional_id uuid default null
)
 returns table(bucket timestamptz, taxas_da_maquininha numeric, comissoes numeric, despesa_de_comissoes numeric)
 language sql
 stable
 security definer
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
    select date_trunc((select g from gran), coalesce(r.paid_at, r.created_at) at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as bucket,
           coalesce(
             (select sum(rc.taxa) from public.recebiveis_do_cartao rc where rc.transaction_id = r.id),
             case when r.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                  then round(r.amount * private.comissao_taxa_pct(p_tenant, r.payment_method::text,
                         coalesce(r.cartao_vezes, r.parcela_total, 1), r.cartao_bandeira) / 100, 2)
                  else 0 end
           ) as taxa,
           0::numeric as comissao, 0::numeric as despesa
      from public.metrics_receitas_pagas(p_tenant, coalesce((select array_agg(id) from scope), '{}'::uuid[]), p_from, p_to, p_professional_id) r
     where r.amount <> 0
    union all
    select date_trunc((select g from gran), c.released_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, c.amount, 0::numeric
      from public.commissions c
      join scope s on s.id = c.branch_id
     where c.released_at between p_from and p_to
       and (p_professional_id is null or c.professional_id = p_professional_id)
    union all
    select date_trunc((select g from gran), coalesce(t.paid_at, t.created_at) at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo',
           0::numeric, 0::numeric, t.amount
      from public.financial_transactions t
      join scope s on s.id = t.branch_id
     where t.type = 'EXPENSE' and t.is_paid
       and coalesce(t.notes, '')    <> 'Estornada'
       and coalesce(t.category, '') <> 'Estorno'
       and lower(btrim(coalesce(t.category, ''))) = 'comissões'
       and coalesce(t.paid_at, t.created_at) between p_from and p_to
       and p_professional_id is null
  )
  select x.bucket, coalesce(sum(x.taxa), 0), coalesce(sum(x.comissao), 0), coalesce(sum(x.despesa), 0)
    from parcelas x
   group by x.bucket
   order by x.bucket
$function$;

revoke execute on function public.metrics_custos_da_venda(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.metrics_series_dos_custos_da_venda(uuid, uuid[], timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.metrics_custos_da_venda(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.metrics_series_dos_custos_da_venda(uuid, uuid[], timestamptz, timestamptz, text, uuid) to service_role;

notify pgrst, 'reload schema';
