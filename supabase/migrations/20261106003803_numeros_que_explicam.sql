-- Os números que explicam a tela (8ª simulação, 2026-11-06; princípio 3 do
-- CLAUDE.md, "o que a tela mostra é o que vale na conta"). Nenhuma regra muda:
-- a receita dos atendimentos continua a PAGA (F18), o crédito interno não é
-- receita (F7) e o estorno sai dos dois lados. Cada função só conta, no banco,
-- o que a tela passa a DIZER ao lado do número.

-- 1. A47 + A43: por procedimento e por profissional, as execuções do período
--    (o eixo `aconteceu_em`) que não trazem receita — o avulso concluído sem
--    pagamento ("R$ 160 concluídos sem pagamento") e o pago com crédito na
--    clínica ("R$ 450 pagos com crédito na clínica: não é receita"). O mesmo
--    conjunto do avulso de `atendimentos_a_receber` (concluído, com preço, sem
--    plano, sem sessão de pacote, sem unidade pré-paga).
create or replace function public.metrics_atendimentos_sem_receita(
  p_tenant uuid, p_branch_ids uuid[], p_from timestamptz, p_to timestamptz, p_professional_id uuid default null)
returns table(eixo text, nome text, sem_pagamento_n bigint, sem_pagamento_valor numeric, com_credito_n bigint, com_credito_valor numeric)
language sql
stable
set search_path to ''
as $$
  with base as (
    select a.id, a.price, pr.name as procedimento, coalesce(u.name, '—') as profissional,
           exists (select 1 from public.financial_transactions f
                    where f.appointment_id = a.id and f.type = 'INCOME' and f.is_paid
                      and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno') as pago,
           (select coalesce(sum(f.amount), 0) from public.financial_transactions f
             where f.appointment_id = a.id and f.type = 'INCOME' and f.is_paid
               and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno'
               and f.payment_method = 'INTERNAL_CREDIT') as com_credito
      from public.appointments a
      join public.branches b on b.id = a.branch_id and b.tenant_id = p_tenant
      join public.procedures pr on pr.id = a.procedure_id
      left join public.users u on u.id = a.professional_id
     where a.status = 'COMPLETED'
       and a.aconteceu_em between p_from and p_to
       and a.price > 0
       and a.treatment_plan_id is null
       and not exists (select 1 from public.package_sessions x where x.appointment_id = a.id)
       and not exists (select 1 from public.procedure_sale_units x where x.appointment_id = a.id)
       and (p_branch_ids is null or a.branch_id = any (p_branch_ids))
       and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  linhas as (
    select 'PROCEDIMENTO'::text as eixo, procedimento as nome, pago, price, com_credito from base
    union all
    select 'PROFISSIONAL', profissional, pago, price, com_credito from base
  )
  select eixo, nome,
         count(*) filter (where not pago),
         coalesce(sum(price) filter (where not pago), 0),
         count(*) filter (where com_credito > 0),
         coalesce(sum(com_credito), 0)
    from linhas
   group by eixo, nome
  having count(*) filter (where not pago) > 0 or coalesce(sum(com_credito), 0) > 0
$$;

-- 2. A43: o que a cliente pagou com crédito na clínica (a ficha diz "Investido
--    total R$ 0" ao lado de "Preço médio R$ 450" — o crédito não é receita, e
--    agora a ficha diz que ele pagou).
create or replace function public.metrics_pago_com_credito_do_cliente(p_tenant uuid, p_client uuid)
returns numeric
language sql
stable
set search_path to ''
as $$
  select coalesce(sum(f.amount), 0)
    from public.financial_transactions f
    join public.branches b on b.id = f.branch_id and b.tenant_id = p_tenant
   where f.client_id = p_client and f.type = 'INCOME' and f.is_paid
     and coalesce(f.notes, '') <> 'Estornada' and coalesce(f.category, '') <> 'Estorno'
     and f.payment_method = 'INTERNAL_CREDIT'
$$;

-- 3. A42: os estornos FEITOS no dia na unidade (o contra-lançamento pago no
--    dia), com o total — o Fechamento os lista (a venda e o estorno se anulam
--    no resumo por forma).
create or replace function public.metrics_estornos_do_dia(p_tenant uuid, p_branch uuid, p_from timestamptz, p_to timestamptz)
returns table(id uuid, descricao text, forma text, vezes smallint, valor numeric, motivo text, total numeric)
language sql
stable
set search_path to ''
as $$
  select f.id, f.description, f.payment_method::text, f.cartao_vezes, f.amount, f.estorno_motivo,
         sum(f.amount) over ()
    from public.financial_transactions f
    join public.branches b on b.id = f.branch_id and b.tenant_id = p_tenant
   where f.branch_id = p_branch and f.category = 'Estorno' and f.is_paid
     and f.paid_at between p_from and p_to
   order by f.paid_at, f.id
$$;

notify pgrst, 'reload schema';
