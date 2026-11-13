-- F75 (A28 da 14ª simulação): o CSV do Fechamento do dia leva a TAXA e o
-- LÍQUIDO por maquininha — a Ivone concilia com cada operadora, e o CSV só
-- trazia o bruto por bandeira. A conta é a MESMA de
-- `metrics_avisos_do_fechamento` (a linha "Taxas da maquininha no dia"):
-- `metrics_receitas_pagas` da unidade no dia, a taxa de cada pagamento por
-- `private.comissao_taxa_pct` (a maquininha, a forma, as vezes, a bandeira).
-- O Pix tem taxa própria, fora das maquininhas (C75): vem numa linha "Pix".
--
-- Quem vê: só quem tem o Financeiro de todos (D7, 2026-11-11) — o servidor
-- nem chama esta função para quem só recebe. Aditiva.

create or replace function public.metrics_taxas_por_maquininha(
  p_tenant uuid, p_branch uuid, p_from timestamptz, p_to timestamptz
) returns table(maquininha text, bruto numeric, taxa numeric, liquido numeric)
language sql
stable
security definer
set search_path to ''
as $$
  with receitas as (
    select r.amount, r.payment_method::text as metodo, coalesce(r.cartao_vezes, r.parcela_total, 1) as vezes,
           r.cartao_bandeira as bandeira, r.maquininha_id
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0 and r.payment_method::text in ('PIX', 'DEBIT_CARD', 'CREDIT_CARD')
  ), com_taxa as (
    select case when r.metodo = 'PIX' then 'Pix'
                else -- A mesma maquininha da taxa: a gravada, senão a que o banco põe.
                coalesce((select m.nome from public.maquininhas m
                           where m.id = private.maquininha_da_venda(p_tenant, r.maquininha_id) and m.tenant_id = p_tenant),
                         'Sem maquininha') end as maquininha,
           r.amount,
           r.amount * private.comissao_taxa_pct(p_tenant, r.metodo, r.vezes, r.bandeira, r.maquininha_id) / 100 as taxa
      from receitas r
  )
  select c.maquininha, round(sum(c.amount), 2), round(sum(c.taxa), 2), round(sum(c.amount) - sum(c.taxa), 2)
    from com_taxa c
   group by c.maquininha
   order by (c.maquininha = 'Pix'), c.maquininha
$$;

revoke execute on function public.metrics_taxas_por_maquininha(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_taxas_por_maquininha(uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
