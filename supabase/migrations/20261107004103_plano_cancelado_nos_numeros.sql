-- D4 da 9ª simulação (decisão 2 do Heitor, 2026-11-07: a regra do pacote vale
-- para o plano). O plano CANCELADO pelo "Cancelar plano" nos números, como o
-- pacote cancelado (F2b, indicadores.md):
--  - nas VENDAS vale o que foi usado (a soma dos procedimentos menos
--    `valor_cancelado`), na data do aceite; o que caiu inteiro sai. O plano
--    cancelado ANTES desta regra (sem `cancelado_em`) continua fora, como era;
--  - na receita dos ATENDIMENTOS (a execução — r3-f13-07, princípio 5: "sem
--    execução, sem valor"), a sessão FEITA de um plano cancelado continua
--    contando no dia em que foi feita. As cinco contas filtravam o plano por
--    `status in ('ACCEPTED', 'COMPLETED')`; passam a aceitar também o plano com
--    `cancelado_em` (só as sessões concluídas entram nelas — as que caíram
--    não têm execução). A troca é feita sobre o corpo ATUAL de cada função
--    (pg_get_functiondef), e falha alto se o trecho não estiver lá.

CREATE OR REPLACE FUNCTION public.metrics_vendas(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, tipo text, data timestamp with time zone, descricao text, quantidade integer, cliente_id uuid, cliente text, profissional text, branch_id uuid, valor numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with scope as (
    select b.id from public.branches b
     where b.tenant_id = p_tenant
       and (p_branch_ids is null or b.id = any (p_branch_ids))
  )
  select a.id, 'PROCEDIMENTO', a.aconteceu_em, pr.name, 1,
         a.client_id, c.name, u.name, a.branch_id,
         a.price - coalesce(t.sale_discount, 0)
    from public.appointments a
    join scope s on s.id = a.branch_id
    join public.procedures pr on pr.id = a.procedure_id
    left join public.clients c on c.id = a.client_id
    left join public.users u on u.id = a.professional_id
    left join lateral (
      select f.sale_discount from public.financial_transactions f
       where f.appointment_id = a.id
       order by (coalesce(f.notes, '') = 'Estornada'), f.created_at desc, f.id
       limit 1
    ) t on true
   where a.status = 'COMPLETED'
     and a.aconteceu_em between p_from and p_to
     and a.price > 0
     and a.treatment_plan_id is null
     and not exists (select 1 from public.package_sessions x where x.appointment_id = a.id)
     and not exists (select 1 from public.procedure_sale_units x where x.appointment_id = a.id)
     and (p_professional_id is null or a.professional_id = p_professional_id)

  -- O pacote cancelado vale o que foi usado (F2b, 2026-11-01); cancelado
  -- sem nenhuma sessão feita, sai. O pacote trazido de fora (F35) não é venda.
  union all
  select cp.id, 'PACOTE', cp.purchased_at, sp.name, cp.total_sessions,
         cp.client_id, c.name, u.name, cp.branch_id, cp.price - coalesce(cp.valor_cancelado, 0)
    from public.client_packages cp
    join scope s on s.id = cp.branch_id
    join public.service_packages sp on sp.id = cp.package_id
    left join public.clients c on c.id = cp.client_id
    left join public.users u on u.id = cp.sold_by
   where cp.purchased_at between p_from and p_to
     and not cp.de_fora
     and (cp.cancelado_em is null or coalesce(cp.price, 0) - coalesce(cp.valor_cancelado, 0) > 0)
     and (p_professional_id is null or cp.sold_by = p_professional_id)

  -- O pré-pago vale sem as unidades canceladas (procedimento_cancelar_unidade:
  -- "a venda passa a valer menos"); todas canceladas, sai.
  union all
  select v.id, 'PRE_PAGO', v.sold_at, pr.name, v.quantity,
         v.client_id, c.name, u.name, v.branch_id, v.price - coalesce(x.cancelado, 0)
    from public.procedure_sales v
    join scope s on s.id = v.branch_id
    join public.procedures pr on pr.id = v.procedure_id
    left join public.clients c on c.id = v.client_id
    left join public.users u on u.id = v.sold_by
    left join lateral (
      select sum(un.preco) cancelado from public.procedure_sale_units un
       where un.sale_id = v.id and un.status = 'CANCELADA'
    ) x on true
   where v.tenant_id = p_tenant
     and v.sold_at between p_from and p_to
     and (coalesce(x.cancelado, 0) = 0 or v.price - x.cancelado > 0)
     and (p_professional_id is null or v.sold_by = p_professional_id)

  -- O plano é de quem VENDEU (D14 da 8ª); sem "Quem vendeu", da dona do plano.
  -- O plano cancelado (D4 da 9ª) vale o que foi usado; sem nada usado, sai.
  union all
  select tp.id, 'PLANO', tp.aceito_em, coalesce(nullif(btrim(tp.name), ''), 'Plano de tratamento'),
         (select count(*)::integer from public.treatment_plan_sessions x where x.plan_id = tp.id),
         tp.client_id, c.name, u.name, tp.branch_id,
         soma.valor - coalesce(tp.valor_cancelado, 0)
    from public.treatment_plans tp
    join scope s on s.id = tp.branch_id
    left join public.clients c on c.id = tp.client_id
    left join public.users u on u.id = coalesce(tp.vendido_por, tp.professional_id)
    cross join lateral (
      select coalesce(sum(x.price), 0) valor
        from public.treatment_plan_session_procedures x
        join public.treatment_plan_sessions ss on ss.id = x.session_id
       where ss.plan_id = tp.id
    ) soma
   where (tp.status in ('ACCEPTED', 'COMPLETED')
          or (tp.cancelado_em is not null and soma.valor - coalesce(tp.valor_cancelado, 0) > 0))
     and tp.aceito_em between p_from and p_to
     and (p_professional_id is null or coalesce(tp.vendido_por, tp.professional_id) = p_professional_id)

  -- A venda de produto (D4, 2026-10-30): na data da venda, pelo vendido, e
  -- "quem vendeu" na coluna Profissional (o recorte do "só os meus"). A
  -- ESTORNADA não é venda (H2, 2026-11-01). O kit (ven-04) diz os produtos.
  -- A devolução em parte (A34 da 8ª) tira do valor e das unidades o que voltou.
  union all
  select ps.id, 'PRODUTO', ps.sold_at, coalesce(ps.descricao, p.name), ps.quantity - coalesce(ps.unidades_devolvidas, 0),
         ps.client_id, c.name, u.name, ps.branch_id, ps.price - coalesce(ps.valor_devolvido, 0)
    from public.product_sales ps
    join scope s on s.id = ps.branch_id
    join public.products p on p.id = ps.product_id
    left join public.clients c on c.id = ps.client_id
    left join public.users u on u.id = ps.sold_by
   where ps.tenant_id = p_tenant
     and ps.estornada_em is null
     and ps.sold_at between p_from and p_to
     and (p_professional_id is null or ps.sold_by = p_professional_id)
$function$;

do $$
declare
  f   record;
  d   text;
  n   text;
begin
  for f in
    select p.oid
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname in ('metrics_procedimentos_executados', 'metrics_receita_por_categoria_de_procedimento',
                         'metrics_relatorio', 'metrics_top_procedures', 'metrics_top_professionals')
  loop
    d := pg_get_functiondef(f.oid);
    n := replace(d, $q$tp.status in ('ACCEPTED', 'COMPLETED')$q$,
                    $q$(tp.status in ('ACCEPTED', 'COMPLETED') or tp.cancelado_em is not null)$q$);
    if n = d then
      raise exception 'O trecho do plano vendido não está em %', f.oid::regprocedure;
    end if;
    execute n;
  end loop;
end $$;

notify pgrst, 'reload schema';
