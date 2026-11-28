-- D5 da 41ª simulação: o aviso "Houve movimento depois do fechamento das HH:MM
-- (entrou R$ X e saiu R$ Y)" (FC-08: "o estorno conta como 'saiu'").
--
-- A conta era a soma do dia de agora contra o retrato do fechamento
-- (`movimentoDepoisDoFechamento`, no app): o estorno de um pagamento de HOJE
-- sai das ENTRADAS do dia (um anula o outro, FC-11) e, na soma, anulava o
-- recebimento novo. Depois das 23:29: o Pix novo de R$ 150, a despesa de R$ 85
-- estornada e os estornos de R$ 150 (o débito), R$ 165 e R$ 90 — o aviso dizia
-- "entrou R$ 85,00 e saiu R$ 255,00".
--
-- Decisão do Claude, 28/11 (pela FC-08 e pela FC-11 "Anula a despesa
-- estornada"): X ("entrou") é todo dinheiro que entrou no caixa depois do
-- retrato — os recebimentos novos e o estorno de uma despesa (o dinheiro
-- voltando ao caixa); Y ("saiu"), os estornos às clientes (de um pagamento de
-- qualquer dia) e as saídas novas. Nada se anula entre si. No caso: entrou
-- R$ 235, saiu R$ 405.
--
-- A conta são os LANÇAMENTOS de depois do fechamento (lançados ou pagos depois
-- de `p_desde`), da unidade e do dia:
-- (a) a receita ou a despesa paga: o valor que entrou ou saiu naquela hora (o
--     de antes de todo estorno — o que ficou + os estornos ligados a ele, como
--     em `metrics_movimentos_pagos`);
-- (b) o estorno feito depois: o de uma receita sai, o de uma despesa entra.
-- O crédito interno não é dinheiro do caixa (FC-11): nem o uso, nem o estorno
-- dele. O lançamento de R$ 0 (o que os pontos pagaram inteiro) não conta.

create or replace function public.metrics_movimento_depois_do_fechamento(
  p_tenant uuid, p_branch uuid, p_from timestamptz, p_to timestamptz, p_desde timestamptz
)
returns table(entrou numeric, saiu numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with linhas as (
    select t.type::text as tipo, false as estorno,
           round((case when coalesce(t.notes, '') = 'Estornada' then 0 else t.amount end)
                 + coalesce((select sum(c.amount) from public.financial_transactions c
                              where c.estorno_de = t.id and c.is_paid and c.category = 'Estorno'), 0), 2) as valor
      from public.financial_transactions t
      join public.branches b on b.id = t.branch_id
     where b.tenant_id = p_tenant and b.id = p_branch
       and t.is_paid and coalesce(t.category, '') <> 'Estorno'
       and t.payment_method is distinct from 'INTERNAL_CREDIT'
       and coalesce(t.paid_at, t.created_at) between p_from and p_to
       and greatest(coalesce(t.paid_at, t.created_at), t.created_at) > p_desde
    union all
    select t.type::text, true, c.amount
      from public.financial_transactions c
      join public.financial_transactions t on t.id = c.estorno_de
      join public.branches b on b.id = t.branch_id
     where b.tenant_id = p_tenant and b.id = p_branch
       and c.category = 'Estorno' and c.is_paid
       and t.is_paid and coalesce(t.category, '') <> 'Estorno'
       and t.payment_method is distinct from 'INTERNAL_CREDIT'
       and coalesce(c.paid_at, c.created_at) between p_from and p_to
       and greatest(coalesce(c.paid_at, c.created_at), c.created_at) > p_desde
  )
  select coalesce(round(sum(l.valor) filter (where (tipo = 'INCOME') <> estorno), 2), 0)::numeric as entrou,
         coalesce(round(sum(l.valor) filter (where (tipo = 'INCOME') = estorno), 2), 0)::numeric as saiu
    from linhas l
   where l.valor <> 0
$$;

revoke execute on function public.metrics_movimento_depois_do_fechamento(uuid, uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.metrics_movimento_depois_do_fechamento(uuid, uuid, timestamptz, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
