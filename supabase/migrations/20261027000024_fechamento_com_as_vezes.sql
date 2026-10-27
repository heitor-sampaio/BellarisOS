-- O Fechamento do dia diz a forma do jeito que ela foi (A33 e A35 da
-- simulação de 2026-10-27).
--
-- A33: o crédito em 3x (pago na hora, `cartao_vezes`) entrava na linha
-- "Cartão de crédito" com o à vista — a maquininha repassa diferente, e o
-- fechamento não dizia. Agora a chave leva as vezes: `CREDIT_CARD:3`.
-- A35: todo lançamento sem forma caía em "Sem forma (pontos)", até a compra de
-- estoque. Agora: a receita sem forma que os pontos pagaram (`loyalty_discount`
-- > 0) é `PONTOS`; todo o resto sem forma é `SEM_FORMA` ("Sem forma de
-- pagamento"). O total e o dinheiro esperado (a linha `CASH`) não mudam.

create or replace function public.metrics_fechamento_do_dia(p_tenant uuid, p_branch uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(forma text, entradas numeric, saidas numeric, saldo numeric, lancamentos integer)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with t as (
    select case
             when r.payment_method is null and coalesce(r.loyalty_discount, 0) > 0 then 'PONTOS'
             when r.payment_method is null then 'SEM_FORMA'
             when r.payment_method = 'CREDIT_CARD' and coalesce(r.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || r.cartao_vezes
             else r.payment_method::text
           end as forma,
           r.amount as entrada, 0::numeric as saida
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0
    union all
    select case
             when f.payment_method is null then 'SEM_FORMA'
             when f.payment_method = 'CREDIT_CARD' and coalesce(f.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || f.cartao_vezes
             else f.payment_method::text
           end,
           0, f.amount
      from public.financial_transactions f
      join public.branches b on b.id = f.branch_id
     where b.tenant_id = p_tenant and b.id = p_branch
       and f.type = 'EXPENSE' and f.is_paid and f.amount <> 0
       and coalesce(f.notes, '')    <> 'Estornada'
       and coalesce(f.category, '') <> 'Estorno'
       and coalesce(f.paid_at, f.created_at) between p_from and p_to
  )
  select coalesce(forma, 'TOTAL'), round(sum(entrada), 2), round(sum(saida), 2),
         round(sum(entrada) - sum(saida), 2), count(*)::integer
    from t
   group by grouping sets ((forma), ())
$function$;

notify pgrst, 'reload schema';
