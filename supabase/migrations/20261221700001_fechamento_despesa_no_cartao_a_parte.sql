-- D3 da 43ª simulação (2026-11-28; vendas-financeiro:FC-15 "a despesa no
-- cartão aparece como 'Cartão'", MQ-15 "o cartão da rede não é maquininha";
-- princípio 3): no Fechamento do dia, a despesa paga no cartão de DÉBITO da
-- rede (o "Conserto da maca", R$ 270) saía do Débito da maquininha — "Débito
-- registrado R$ 150" (420 − 270) contra os R$ 420 da maquininha, e "Cartão:
-- R$ 0,00 (saídas R$ 270,00)" dentro da linha. Quem confere pela maquininha
-- via R$ 270 de diferença que não existe.
--
-- A despesa no crédito ou no débito (e o estorno dela) ganha a chave própria
-- CARTAO no Fechamento, que a tela chama "Cartão" e não confere; a forma do
-- cartão fica só com o que passou na maquininha (os recebimentos e o estorno
-- às clientes, que é da maquininha do pagamento — FC-11). O cartão por
-- maquininha e bandeira deixa de ter a despesa (ela não tem maquininha). O
-- total do dia não muda. Os corpos partem dos vivos (pg_get_functiondef em
-- 28/11); só muda o trecho da despesa.

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
           case when r.estorno_de is null then r.amount else 0::numeric end as entrada,
           case when r.estorno_de is null then 0::numeric else -r.amount end as saida
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0
    union all
    select case
             when f.payment_method is null then 'SEM_FORMA'
             -- D3 da 43ª: o cartão da rede não é a maquininha (MQ-15).
             when f.payment_method in ('CREDIT_CARD', 'DEBIT_CARD') then 'CARTAO'
             else f.payment_method::text
           end,
           case when f.estorno_de is null then 0::numeric else -f.amount end,
           case when f.estorno_de is null then f.amount else 0::numeric end
      from public.metrics_movimentos_pagos(p_tenant, array[p_branch], p_from, p_to) f
     where f.type = 'EXPENSE' and f.amount <> 0
  )
  select coalesce(forma, 'TOTAL'), round(sum(entrada), 2), round(sum(saida), 2),
         round(sum(entrada) - sum(saida), 2), count(*)::integer
    from t
   group by grouping sets ((forma), ())
$function$;

create or replace function public.metrics_fechamento_por_maquininha(p_tenant uuid, p_branch uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(forma text, maquininha_id uuid, maquininha text, bandeira text, entradas numeric, saidas numeric, lancamentos integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  -- D3 da 43ª: só o que passou na maquininha; a despesa no cartão da rede é a
  -- linha "Cartão" do Fechamento (metrics_fechamento_do_dia), sem maquininha.
  with t as (
    select case
             when r.payment_method = 'CREDIT_CARD' and coalesce(r.cartao_vezes, 1) > 1
               then 'CREDIT_CARD:' || r.cartao_vezes
             else r.payment_method::text
           end as forma,
           private.maquininha_da_venda(p_tenant, r.maquininha_id) as maq,
           r.cartao_bandeira as bandeira,
           case when r.estorno_de is null then r.amount else 0::numeric end as entrada,
           case when r.estorno_de is null then 0::numeric else -r.amount end as saida
      from public.metrics_receitas_pagas(p_tenant, array[p_branch], p_from, p_to) r
     where r.amount <> 0 and r.payment_method in ('CREDIT_CARD', 'DEBIT_CARD')
  )
  select t.forma, t.maq, m.nome, t.bandeira, round(sum(t.entrada), 2), round(sum(t.saida), 2), count(*)::integer
    from t
    left join public.maquininhas m on m.id = t.maq
   group by t.forma, t.maq, m.nome, t.bandeira
   order by t.forma, m.nome nulls last, t.bandeira nulls last
$function$;

revoke execute on function public.metrics_fechamento_do_dia(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_fechamento_do_dia(uuid, uuid, timestamptz, timestamptz) to service_role;
revoke execute on function public.metrics_fechamento_por_maquininha(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_fechamento_por_maquininha(uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
