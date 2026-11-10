-- A31 da 10ª simulação (2026-11-10): a contadora não fechava o mês com o que
-- exportava. O CSV de lançamentos não tinha a taxa, o líquido, o fornecedor
-- nem a nota; e a compra de reposição e a perda não chegavam a ela, que não vê
-- o relatório de Estoque.
--
-- 1. financial_transactions.fornecedor / nota_fiscal: o lançamento manual guarda
--    o fornecedor (despesa) e a nota fiscal (despesa e receita). Informação, como
--    as Observações: nenhuma conta os lê.
-- 2. metrics_taxa_dos_lancamentos: a taxa da maquininha e o líquido de cada
--    receita paga, pela MESMA conta do lucro (metrics_custos_da_venda): a
--    gravada nas parcelas da operadora; sem elas, o recebimento × a taxa da
--    configuração (Pix, débito e crédito). O resto, nulo. Só o servidor chama.
-- 3. metrics_entradas_de_estoque: as entradas de estoque do período (as
--    compras), ao custo do movimento, com o fornecedor e a nota (A37) — e o
--    total. A entrada desfeita (A38) não entra. É o "fora do resultado" do DRE
--    que se exporta (a movimentação de estoque nunca gera despesa — D13 revisto).

alter table public.financial_transactions
  add column if not exists fornecedor  text,
  add column if not exists nota_fiscal text;

create or replace function public.metrics_taxa_dos_lancamentos(p_tenant uuid, p_ids uuid[])
returns table(id uuid, taxa numeric, liquido numeric)
language sql
stable
security definer
set search_path to ''
as $function$
  select t.id,
         x.taxa,
         case when x.taxa is not null then t.amount - x.taxa end
    from public.financial_transactions t
    join public.branches b on b.id = t.branch_id and b.tenant_id = p_tenant
    cross join lateral (
      select case
               when t.type = 'INCOME' and t.is_paid and t.amount > 0
                    and coalesce(t.notes, '') <> 'Estornada' and coalesce(t.category, '') <> 'Estorno'
               then coalesce(
                      (select sum(rc.taxa) from public.recebiveis_do_cartao rc where rc.transaction_id = t.id),
                      case when t.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
                           then round(t.amount * private.comissao_taxa_pct(p_tenant, t.payment_method::text,
                                  coalesce(t.cartao_vezes, t.parcela_total, 1), t.cartao_bandeira) / 100, 2)
                           else 0 end)
             end as taxa
    ) x
   where t.id = any (p_ids)
$function$;

revoke execute on function public.metrics_taxa_dos_lancamentos(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_taxa_dos_lancamentos(uuid, uuid[]) to service_role;

create or replace function public.metrics_entradas_de_estoque(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
returns table(movimento uuid, dia timestamp with time zone, unidade text, produto text, embalagens numeric, embalagem text, custo numeric, fornecedor text, nota_fiscal text)
language sql
stable
security definer
set search_path to ''
as $function$
  with entradas as (
    select m.id, m.created_at, b.name as unidade, p.name as produto,
           abs(m.quantity) / public.fator_de_consumo(p) as embalagens, p.unit as embalagem,
           public.custo_do_movimento(m, p) as custo, m.fornecedor, m.nota_fiscal
      from public.stock_movements m
      join public.branches b on b.id = m.branch_id and b.tenant_id = p_tenant
      join public.products p on p.id = m.product_id
     where m.type = 'PURCHASE' and m.quantity > 0 and m.desfeita_em is null
       and (p_branch_ids is null or m.branch_id = any (p_branch_ids))
       and m.created_at between p_from and p_to
  )
  select e.id, e.created_at, e.unidade, e.produto, round(e.embalagens, 4), e.embalagem, round(coalesce(e.custo, 0), 2), e.fornecedor, e.nota_fiscal
    from entradas e
  union all
  -- O total (movimento nulo): a soma das entradas, no banco.
  select null, null, null, null, null, null, round(coalesce(sum(e.custo), 0), 2), null, null
    from entradas e
$function$;

revoke execute on function public.metrics_entradas_de_estoque(uuid, uuid[], timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.metrics_entradas_de_estoque(uuid, uuid[], timestamp with time zone, timestamp with time zone) to service_role;

notify pgrst, 'reload schema';
