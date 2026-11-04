-- F16-2 (F17; o Heitor recusou o fallback da F16 — "pode levar a erros de
-- cálculos, precisa achar outra solução" — e escolheu a opção A): sem a taxa
-- EXATA daquelas vezes, nem na bandeira nem na regra geral, a taxa é 0% —
-- nunca a de outras vezes. Era a regra geral caindo na maior quantidade
-- cadastrada abaixo (nada em 4x, a venda Elo 4x usava o 3x da geral). Débito e
-- 1x seguem a mesma regra. Nada é recusado: a venda grava normalmente, sem
-- desconto da operadora; a clínica fica sabendo pela tela das taxas e pelo
-- Fechamento do dia (`metrics_vendas_sem_taxa_do_fechamento`, abaixo).
--
-- A taxa que existe (ou nula) mora num lugar só:
-- - private.taxa_geral_exata: a da regra geral (payment_fees) naquelas vezes —
--   no crédito, as vezes do pagamento (1 a 12); no débito e no Pix, a única (1);
-- - private.taxa_da_maquininha: a da bandeira naquelas vezes (o débito, 1),
--   senão a geral exata;
-- - private.comissao_taxa_pct (as duas assinaturas, os mesmos chamadores de
--   sempre: o líquido da comissão, o que a operadora deposita, a estimativa do
--   Fechamento) = a de cima, ou 0.

create or replace function private.taxa_geral_exata(p_tenant uuid, p_metodo text, p_parcelas integer)
returns numeric
language sql
stable security definer
set search_path to ''
as $$
  select f.taxa_pct
    from public.payment_fees f
   where f.tenant_id = p_tenant and f.metodo = p_metodo
     and f.parcelas = case when p_metodo = 'CREDIT_CARD'
                           then greatest(1, least(12, coalesce(p_parcelas, 1))) else 1 end
   limit 1
$$;

create or replace function private.taxa_da_maquininha(p_tenant uuid, p_metodo text, p_parcelas integer, p_bandeira text)
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
    private.taxa_geral_exata(p_tenant, p_metodo, p_parcelas))
$$;

revoke execute on function private.taxa_geral_exata(uuid, text, integer) from public;
revoke execute on function private.taxa_da_maquininha(uuid, text, integer, text) from public;

-- A regra geral: a das vezes EXATAS, senão 0 (era a maior cadastrada abaixo).
create or replace function private.comissao_taxa_pct(p_tenant uuid, p_metodo text, p_parcelas integer)
returns numeric
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(private.taxa_geral_exata(p_tenant, p_metodo, p_parcelas), 0)
$$;

-- Com a bandeira: a dela naquelas vezes, senão a geral naquelas vezes, senão 0.
create or replace function private.comissao_taxa_pct(p_tenant uuid, p_metodo text, p_parcelas integer, p_bandeira text)
returns numeric
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(private.taxa_da_maquininha(p_tenant, p_metodo, p_parcelas, p_bandeira), 0)
$$;

-- O aviso do Fechamento do dia: as vendas no cartão (débito e crédito) do dia
-- sem taxa da maquininha cadastrada para aquela forma, vezes e bandeira — elas
-- saíram sem desconto da operadora. O Pix sem taxa é comum e não avisa.
create or replace function public.metrics_vendas_sem_taxa_do_fechamento(p_tenant uuid, p_branch uuid, p_from timestamptz, p_to timestamptz)
returns table (metodo text, vezes integer, bandeira text, vendas integer, valor numeric)
language sql
stable security definer
set search_path to ''
as $$
  with receitas as (
    select r.amount, r.payment_method::text as metodo, r.cartao_bandeira as bandeira,
           case when r.payment_method::text = 'CREDIT_CARD'
                then greatest(1, least(12, coalesce(r.cartao_vezes, r.parcela_total, 1))) else 1 end as vezes
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount > 0 and r.payment_method::text in ('DEBIT_CARD', 'CREDIT_CARD')
  )
  select x.metodo, x.vezes, x.bandeira, count(*)::integer, sum(x.amount)
    from receitas x
   where private.taxa_da_maquininha(p_tenant, x.metodo, x.vezes, x.bandeira) is null
   group by x.metodo, x.vezes, x.bandeira
   order by x.metodo, x.vezes, x.bandeira nulls first
$$;

revoke execute on function public.metrics_vendas_sem_taxa_do_fechamento(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_vendas_sem_taxa_do_fechamento(uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
