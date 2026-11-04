-- r4-f15-01 (F16; o Heitor, revisão das decisões da F15, 2026-11-03: "o campo
-- vazio da bandeira = regra geral"). Na r3-f13-01 (migration 20261103001502) a
-- taxa da bandeira era a MAIOR faixa de vezes cadastrada nela até as vezes do
-- pagamento: a Elo só com o 3x (3%) dava os 3% também à venda Elo em 5x. Agora a
-- bandeira vale só com a taxa EXATA daquelas vezes (o débito, a do débito);
-- senão vale a REGRA GERAL daquelas vezes — o número que a tela já mostra no
-- campo vazio da bandeira. Sem herdar faixa da bandeira.
--
-- A regra geral (a de 3 argumentos) não muda: nela, a parcela sem taxa própria
-- segue usando a maior quantidade cadastrada abaixo (D-15/A33). A Elo em 4x,
-- sem 4x na Elo nem na geral, usa a geral de 4x — que é a do 3x da geral.
--
-- Quem lê (sem mudar nada lá): o líquido da comissão (`comissao_conta`), o que a
-- operadora deposita (`recebiveis_do_cartao_acompanham`) e a estimativa do
-- Fechamento do dia (`metrics_avisos_do_fechamento`) — todos pela de 4
-- argumentos. As linhas já retratadas não se refazem.

create or replace function private.comissao_taxa_pct(p_tenant uuid, p_metodo text, p_parcelas integer, p_bandeira text)
returns numeric
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(
    (select (t.cartao_por_bandeira -> upper(p_bandeira) -> 'taxas' ->> (
              p_metodo || ':' || case when p_metodo = 'DEBIT_CARD' then 1
                                       else greatest(1, least(12, coalesce(p_parcelas, 1))) end))::numeric
       from public.tenants t
      where t.id = p_tenant and p_bandeira is not null
        and jsonb_typeof(t.cartao_por_bandeira -> upper(p_bandeira) -> 'taxas' -> (
              p_metodo || ':' || case when p_metodo = 'DEBIT_CARD' then 1
                                       else greatest(1, least(12, coalesce(p_parcelas, 1))) end)) = 'number'),
    private.comissao_taxa_pct(p_tenant, p_metodo, p_parcelas))
$$;

notify pgrst, 'reload schema';
