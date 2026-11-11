-- A43 e A44 da 12ª simulação (2026-11-11; a Ivone, contadora da Acácia;
-- princípio 3).
--
-- A43: o "Em aberto, todos os vencimentos" existia só para o a receber; as
-- contas a PAGAR de outros meses não tinham número nem lista, e o "A pagar"
-- era só do período. `metrics_a_pagar_em_aberto` é o espelho de
-- `metrics_a_receber_em_aberto` para a despesa: em aberto, de qualquer
-- vencimento, sem o estornado e o saldo zerado — por unidade e no total.
--
-- A44: o Fechamento do dia juntava o "Cartão de crédito 6x" das duas
-- bandeiras, e a Ivone concilia com a operadora por bandeira.
-- `metrics_fechamento_por_bandeira` divide as linhas de cartão (crédito e
-- débito) do Fechamento pela bandeira, com o MESMO conjunto e a mesma chave da
-- forma de `metrics_fechamento_do_dia` (parte do corpo atual de produção): as
-- entradas pela regra única de receita (o estorno de outro dia é saída), e as
-- saídas pagas no cartão. A bandeira não informada vem nula. Só leitura.

create or replace function public.metrics_a_pagar_em_aberto(p_tenant uuid, p_branch_ids uuid[])
returns table(branch_id uuid, valor numeric)
language sql
stable
set search_path to ''
as $function$
  select t.branch_id, coalesce(round(sum(t.amount), 2), 0)
    from public.financial_transactions t
    join public.branches b on b.id = t.branch_id
   where b.tenant_id = p_tenant
     and (p_branch_ids is null or b.id = any (p_branch_ids))
     and t.type = 'EXPENSE'
     and not t.is_paid
     and t.amount <> 0
     and coalesce(t.notes, '')    <> 'Estornada'
     and coalesce(t.category, '') <> 'Estorno'
   group by grouping sets ((t.branch_id), ())
$function$;

revoke execute on function public.metrics_a_pagar_em_aberto(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.metrics_a_pagar_em_aberto(uuid, uuid[]) to service_role;

create or replace function public.metrics_fechamento_por_bandeira(p_tenant uuid, p_branch uuid, p_from timestamp with time zone, p_to timestamp with time zone)
returns table(forma text, bandeira text, entradas numeric, saidas numeric, lancamentos integer)
language sql
stable
security definer
set search_path to ''
as $function$
  with t as (
    select case
             when r.payment_method = 'CREDIT_CARD' and coalesce(r.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || r.cartao_vezes
             else r.payment_method::text
           end as forma,
           r.cartao_bandeira as bandeira,
           case when r.estorno_de is null then r.amount else 0::numeric end as entrada,
           case when r.estorno_de is null then 0::numeric else -r.amount end as saida
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0 and r.payment_method in ('CREDIT_CARD', 'DEBIT_CARD')
    union all
    select case
             when f.payment_method = 'CREDIT_CARD' and coalesce(f.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || f.cartao_vezes
             else f.payment_method::text
           end,
           f.cartao_bandeira,
           case when f.estorno_de is null then 0::numeric else -f.amount end,
           case when f.estorno_de is null then f.amount else 0::numeric end
      from public.metrics_movimentos_pagos(p_tenant, array[p_branch], p_from, p_to) f
     where f.type = 'EXPENSE' and f.amount <> 0 and f.payment_method in ('CREDIT_CARD', 'DEBIT_CARD')
  )
  select forma, bandeira, round(sum(entrada), 2), round(sum(saida), 2), count(*)::integer
    from t
   group by forma, bandeira
   order by forma, bandeira nulls last
$function$;

revoke execute on function public.metrics_fechamento_por_bandeira(uuid, uuid, timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.metrics_fechamento_por_bandeira(uuid, uuid, timestamp with time zone, timestamp with time zone) to service_role;

notify pgrst, 'reload schema';
