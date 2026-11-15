-- D1 da 16ª simulação (2026-11-15; princípio 3: o que a tela mostra é o que
-- vale na conta).
--
-- Estornar só o "Atendimento concluído" de uma comanda que levava produto
-- reabre a comanda — mas o produto segue vendido e pago (o lançamento dele e a
-- baixa do estoque ficam). A comanda reaberta pedia "Receber R$ 409,00" (o
-- atendimento E o hidratante já pago), enquanto o servidor grava só o
-- atendimento e os produtos ainda NÃO vendidos (`valorDosItensDoAtendimento`,
-- e o banco vende só os de `product_sale_id is null`). O balcão cobraria o
-- produto de novo na maquininha.
--
-- Agora, na comanda do atendimento:
--   * valor   — a receber: o atendimento e os produtos ainda não vendidos; paga,
--               o atendimento e os produtos dela (todos vendidos com ela);
--   * ja_pago — os produtos dela já vendidos enquanto a comanda está a receber
--               (a comanda reaberta pelo estorno); zero no resto.
--
-- O resto do corpo é o de 20261116500001. A assinatura de saída muda (a coluna
-- nova), então a função sai e volta; a segurança é a mesma (só o service_role).

drop function if exists public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz);

create function public.pdv_comandas(p_tenant uuid, p_branch uuid, p_situacao text, p_de timestamptz, p_ate timestamptz)
 returns table(id uuid, numero integer, origem text, aberta_em timestamptz, cancelada_em timestamptz, cancelada_motivo text,
               client_id uuid, cliente text, appointment_id uuid, procedimento text, profissional text, agendado_para timestamptz,
               atendimento_status text, valor numeric, paga boolean, paga_em timestamptz, recebido numeric, forma text,
               lancamento_id uuid, estornada boolean, treatment_plan_id uuid,
               em_aberto numeric, parcelas_em_aberto integer, proxima_parcela timestamptz, produtos integer,
               ja_pago numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  with c as (
    select c.*, a.price, a.scheduled_at, a.status::text as a_status, a.procedure_id, a.professional_id,
           f.id as f_id, f.paid_at, f.amount, f.payment_method::text as f_forma,
           it.valor as it_valor, it.vendidos as it_vendidos, it.recebido as it_recebido, it.produtos as it_produtos,
           v.valor as v_valor, v.recebido as v_recebido, v.forma as v_forma, v.estornada as v_estornada,
           v.primeiro as v_primeiro, v.em_aberto as v_em_aberto, v.parcelas as v_parcelas, v.proxima as v_proxima,
           case
             when c.client_package_id is not null then (select sp.name from public.client_packages cp
                 join public.service_packages sp on sp.id = cp.package_id where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select s.quantity || '× ' || pr.name from public.procedure_sales s
                 join public.procedures pr on pr.id = s.procedure_id where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select coalesce(nullif(s.descricao, ''), p.name) from public.product_sales s
                 left join public.products p on p.id = s.product_id where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then 'Crédito na rede'
             when c.treatment_plan_id is not null then (select coalesce(nullif(trim(tp.name), ''), 'Plano de tratamento')
                 from public.treatment_plans tp where tp.id = c.treatment_plan_id)
           end as v_item,
           case
             when c.client_package_id is not null then (select u.name from public.client_packages cp
                 join public.users u on u.id = cp.sold_by where cp.id = c.client_package_id)
             when c.procedure_sale_id is not null then (select u.name from public.procedure_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.procedure_sale_id)
             when c.product_sale_id is not null then (select u.name from public.product_sales s
                 join public.users u on u.id = s.sold_by where s.id = c.product_sale_id)
             when c.credito_vendido_id is not null then (select s.registrado_por_nome from public.creditos_vendidos s
                 where s.id = c.credito_vendido_id)
             when c.treatment_plan_id is not null then (select u.name from public.treatment_plans tp
                 join public.users u on u.id = tp.professional_id where tp.id = c.treatment_plan_id)
           end as v_quem,
           case when c.treatment_plan_id is not null then (select coalesce(sum(p.price), 0)
                 from public.treatment_plan_session_procedures p
                 join public.treatment_plan_sessions s on s.id = p.session_id
                where s.plan_id = c.treatment_plan_id) end as pl_valor
      from public.comandas c
      left join public.appointments a on a.id = c.appointment_id
      left join lateral (
        select f.id, f.paid_at, f.amount, f.payment_method
          from public.financial_transactions f
         where c.appointment_id is not null and f.appointment_id = c.appointment_id and f.is_paid
           and coalesce(f.notes, '') <> 'Estornada'
         order by f.paid_at desc nulls last
         limit 1
      ) f on true
      left join lateral (
        select coalesce((select sum(round(p.sale_price, 2) * i.quantidade)
                           from public.comanda_itens i join public.products p on p.id = i.product_id
                          where i.comanda_id = c.id and i.product_sale_id is null), 0) as valor,
               coalesce((select sum(ps.preco_tabela) from public.product_sales ps
                          where ps.id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)), 0) as vendidos,
               coalesce((select sum(t.amount) from public.financial_transactions t
                          where t.product_sale_id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)
                            and t.type::text = 'INCOME' and t.estorno_de is null and t.is_paid
                            and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               (select count(*)::integer from public.comanda_itens i where i.comanda_id = c.id) as produtos
         where c.origem = 'ATENDIMENTO'
      ) it on true
      left join lateral (
        select sum(coalesce(t.valor_antes_do_estorno, t.amount)) as valor,
               coalesce(sum(t.amount) filter (where t.is_paid and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               case
                 when bool_or(t.parcela_grupo is not null) then 'CREDIARIO'
                 else coalesce(
                   (array_agg(t.payment_method::text order by t.parcela_numero nulls first, t.created_at))[1],
                   case when bool_or(not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada') then 'A_RECEBER' end)
               end as forma,
               bool_and(coalesce(t.notes, '') = 'Estornada') as estornada,
               min(t.created_at) filter (where coalesce(t.notes, '') <> 'Estornada') as primeiro,
               coalesce(sum(t.amount) filter (where not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada'), 0) as em_aberto,
               (count(*) filter (where not t.is_paid and t.amount > 0 and t.parcela_grupo is not null
                                   and coalesce(t.notes, '') <> 'Estornada'))::integer as parcelas,
               min(t.due_date) filter (where not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada') as proxima
          from public.financial_transactions t
         where c.origem in ('VENDA', 'PLANO') and t.type::text = 'INCOME' and t.estorno_de is null
           and (t.client_package_id = c.client_package_id or t.procedure_sale_id = c.procedure_sale_id
                or t.product_sale_id = c.product_sale_id or t.credito_vendido_id = c.credito_vendido_id
                or t.treatment_plan_id = c.treatment_plan_id)
      ) v on true
     where c.tenant_id = p_tenant and c.branch_id = p_branch
  ), s as (
    select c.*,
           case c.origem
             when 'VENDA' then true
             when 'PLANO' then c.v_primeiro is not null
             else c.f_id is not null
           end as e_paga,
           case c.origem
             when 'VENDA' then c.aberta_em
             when 'PLANO' then c.v_primeiro
             else c.paid_at
           end as e_paga_em
      from c
  )
  select s.id, s.numero, s.origem, s.aberta_em, s.cancelada_em, s.cancelada_motivo,
         s.client_id, cl.name, s.appointment_id,
         case when s.origem in ('VENDA', 'PLANO') then s.v_item else pr.name end,
         case when s.origem in ('VENDA', 'PLANO') then s.v_quem else u.name end,
         s.scheduled_at, s.a_status,
         round(case s.origem
                 when 'VENDA' then coalesce(s.v_valor, 0)
                 when 'PLANO' then coalesce(s.pl_valor, 0)
                 -- D1 da 16ª: a receber, só o que falta (o produto já vendido fica em ja_pago).
                 else coalesce(s.price, 0) + coalesce(s.it_valor, 0)
                      + case when s.e_paga then coalesce(s.it_vendidos, 0) else 0 end end, 2),
         s.e_paga,
         s.e_paga_em,
         round(case when s.origem in ('VENDA', 'PLANO') then s.v_recebido
                    else s.amount + coalesce(s.it_recebido, 0) end, 2),
         case when s.origem in ('VENDA', 'PLANO') then s.v_forma else s.f_forma end,
         s.f_id,
         s.origem in ('VENDA', 'PLANO') and s.v_valor is not null and coalesce(s.v_estornada, false),
         s.treatment_plan_id,
         round(case when s.origem in ('VENDA', 'PLANO') then coalesce(s.v_em_aberto, 0) else 0 end, 2),
         case when s.origem in ('VENDA', 'PLANO') then coalesce(s.v_parcelas, 0) else 0 end,
         case when s.origem in ('VENDA', 'PLANO') then s.v_proxima end,
         coalesce(s.it_produtos, 0),
         round(case when s.origem = 'ATENDIMENTO' and not s.e_paga then coalesce(s.it_vendidos, 0) else 0 end, 2)
    from s
    left join public.clients cl on cl.id = s.client_id
    left join public.procedures pr on pr.id = s.procedure_id
    left join public.users u on u.id = s.professional_id
   where case p_situacao
           when 'ABERTAS' then s.cancelada_em is null and not s.e_paga
           when 'PAGAS'   then s.e_paga and s.e_paga_em between p_de and p_ate
           else (s.cancelada_em is null and not s.e_paga)
             or (s.e_paga and s.e_paga_em between p_de and p_ate)
             or (s.cancelada_em between p_de and p_ate)
         end
$function$;

revoke execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.pdv_comandas(uuid, uuid, text, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
