-- D1 da 19ª simulação (2026-11-16; princípio 3: o que a tela mostra é o que
-- vale na conta). O pacote "5 depilações" (R$ 1.000, débito) foi estornado de
-- dentro da comanda e recebido de novo, e a comanda dizia R$ 2.000,00. O
-- `valor` da comanda VENDA somava `coalesce(valor_antes_do_estorno, amount)` de
-- toda receita da venda: o lançamento original ("Estornada") e o reaberto pelo
-- estorno (`estornar_e_reabrir`, 20261112006703). Agora o estornado que ganhou
-- o reaberto (o mesmo created_at do estorno, a mesma venda e parcela) fica
-- fora do valor e da forma, e a comanda da venda e do plano diz o estorno
-- (`estorno_anterior`), como a do atendimento já dizia (A2 da 17ª).
--
-- A1 da 19ª: as `formas` levam a bandeira ("Crédito Mastercard 10x": a taxa
-- depende dela), e a venda paga à vista também as tem (a forma de agora, não a
-- do pagamento estornado).
--
-- O corpo é o de 20261118300001, com isso só; a assinatura não muda.

create or replace function public.pdv_comandas(p_tenant uuid, p_branch uuid, p_situacao text, p_de timestamptz, p_ate timestamptz)
 returns table(id uuid, numero integer, origem text, aberta_em timestamptz, cancelada_em timestamptz, cancelada_motivo text,
               client_id uuid, cliente text, appointment_id uuid, procedimento text, profissional text, agendado_para timestamptz,
               atendimento_status text, valor numeric, paga boolean, paga_em timestamptz, recebido numeric, forma text,
               lancamento_id uuid, estornada boolean, treatment_plan_id uuid,
               em_aberto numeric, parcelas_em_aberto integer, proxima_parcela timestamptz, produtos integer,
               ja_pago numeric,
               formas jsonb, desconto numeric, fidelidade numeric, voucher text, estorno_anterior jsonb)
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
           v.substituida_id as v_substituida,
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
               -- D2 da 18ª: a venda de produto estornada não é "já pago" nem entra no valor da comanda paga.
               coalesce((select sum(ps.preco_tabela) from public.product_sales ps
                          where ps.id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)
                            and ps.estornada_em is null), 0) as vendidos,
               coalesce((select sum(t.amount) from public.financial_transactions t
                          where t.product_sale_id in (select i.product_sale_id from public.comanda_itens i where i.comanda_id = c.id)
                            and t.type::text = 'INCOME' and t.estorno_de is null and t.is_paid
                            and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               (select count(*)::integer from public.comanda_itens i where i.comanda_id = c.id) as produtos
         where c.origem = 'ATENDIMENTO'
      ) it on true
      left join lateral (
        -- D1 da 19ª: o estornado que ganhou o lançamento reaberto (estornar_e_reabrir) não conta no valor:
        -- o reaberto é ele de novo. O estornado sem reaberto (a venda cancelada) segue no valor.
        select sum(coalesce(t.valor_antes_do_estorno, t.amount)) filter (where not sb.substituida) as valor,
               coalesce(sum(t.amount) filter (where t.is_paid and coalesce(t.notes, '') <> 'Estornada'), 0) as recebido,
               case
                 when bool_or(t.parcela_grupo is not null) then 'CREDIARIO'
                 else coalesce(
                   (array_agg(t.payment_method::text order by t.parcela_numero nulls first, t.created_at) filter (where not sb.substituida))[1],
                   case when bool_or(not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada') then 'A_RECEBER' end)
               end as forma,
               bool_and(coalesce(t.notes, '') = 'Estornada') as estornada,
               min(t.created_at) filter (where coalesce(t.notes, '') <> 'Estornada') as primeiro,
               coalesce(sum(t.amount) filter (where not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada'), 0) as em_aberto,
               (count(*) filter (where not t.is_paid and t.amount > 0 and t.parcela_grupo is not null
                                   and coalesce(t.notes, '') <> 'Estornada'))::integer as parcelas,
               min(t.due_date) filter (where not t.is_paid and t.amount > 0 and coalesce(t.notes, '') <> 'Estornada') as proxima,
               (array_agg(t.id order by t.created_at desc) filter (where sb.substituida))[1] as substituida_id
          from public.financial_transactions t
          cross join lateral (
            -- O reaberto nasce na MESMA transação do estorno (o mesmo created_at), da mesma venda e parcela.
            select exists (
              select 1 from public.financial_transactions e
                join public.financial_transactions r on r.created_at = e.created_at
               where e.estorno_de = t.id and r.id <> t.id and r.type::text = 'INCOME' and r.estorno_de is null
                 and r.client_package_id is not distinct from t.client_package_id
                 and r.procedure_sale_id is not distinct from t.procedure_sale_id
                 and r.treatment_plan_id is not distinct from t.treatment_plan_id
                 and r.parcela_numero is not distinct from t.parcela_numero) as substituida
          ) sb
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
         round(case when s.origem = 'ATENDIMENTO' and not s.e_paga then coalesce(s.it_vendidos, 0) else 0 end, 2),
         -- D3 da 17ª: as formas dos lançamentos vivos e pagos da comanda paga (o atendimento e os produtos).
         -- A1 da 19ª: com a bandeira; e as da venda paga à vista (D1 da 19ª: a forma de agora, não a estornada).
         coalesce((select jsonb_agg(jsonb_build_object('forma', x.forma, 'vezes', x.vezes, 'bandeira', x.bandeira, 'valor', x.valor) order by x.valor desc, x.forma)
                     from (select t.payment_method::text as forma, coalesce(t.cartao_vezes, 1)::integer as vezes,
                                  t.cartao_bandeira::text as bandeira, round(sum(t.amount), 2) as valor
                             from public.financial_transactions t
                            where t.id = any (coalesce(pg.ids, vp.ids)) and t.payment_method is not null
                            group by 1, 2, 3 having sum(t.amount) <> 0) x), '[]'::jsonb),
         -- A1 da 17ª: o desconto comercial e o da fidelidade (voucher ou pontos) desses lançamentos.
         round(coalesce(pg.desconto, 0), 2),
         round(coalesce(pg.fidelidade, 0), 2),
         (select v.name from public.loyalty_vouchers v where v.used_transaction_id = any (pg.ids) order by v.name limit 1),
         -- A2 da 17ª: a comanda do atendimento reaberta diz o pagamento estornado mais recente.
         case when s.origem = 'ATENDIMENTO' and not s.e_paga and s.appointment_id is not null then (
           select jsonb_build_object(
                    'quando', e.created_at, 'valor', coalesce(o.valor_antes_do_estorno, o.amount),
                    'forma', o.payment_method::text, 'vezes', coalesce(o.cartao_vezes, 1),
                    'desconto', coalesce(o.sale_discount, 0), 'fidelidade', coalesce(o.loyalty_discount, 0),
                    'voucher', (select v.name from public.loyalty_vouchers v where v.used_transaction_id = o.id limit 1))
             from public.financial_transactions o
             join public.financial_transactions e on e.estorno_de = o.id
            where o.appointment_id = s.appointment_id and o.type::text = 'INCOME' and o.notes = 'Estornada'
            order by e.created_at desc
            limit 1)
         -- D1 da 19ª: a venda e o plano dizem o pagamento estornado que ganhou o reaberto — a receber ou recebido de novo.
         when s.origem in ('VENDA', 'PLANO') and s.v_substituida is not null then (
           select jsonb_build_object(
                    'quando', e.created_at, 'valor', coalesce(o.valor_antes_do_estorno, o.amount),
                    'forma', o.payment_method::text, 'vezes', coalesce(o.cartao_vezes, 1),
                    'desconto', coalesce(o.sale_discount, 0), 'fidelidade', coalesce(o.loyalty_discount, 0),
                    'voucher', (select v.name from public.loyalty_vouchers v where v.used_transaction_id = o.id limit 1))
             from public.financial_transactions o
             join public.financial_transactions e on e.estorno_de = o.id
            where o.id = s.v_substituida
            order by e.created_at desc
            limit 1)
         end
    from s
    left join lateral (
      -- Os lançamentos vivos e pagos da comanda do atendimento paga: o do atendimento e os dos produtos dela.
      select array_agg(x.id) as ids, sum(x.desconto) as desconto, sum(x.fidelidade) as fidelidade
        from (
          select t.id, coalesce(t.sale_discount, 0) as desconto, coalesce(t.loyalty_discount, 0) as fidelidade
            from public.financial_transactions t
           where t.id = s.f_id
          union all
          select t.id, coalesce(t.sale_discount, 0), coalesce(t.loyalty_discount, 0)
            from public.comanda_itens i
            join public.financial_transactions t on t.product_sale_id = i.product_sale_id
           where i.comanda_id = s.id and t.type::text = 'INCOME' and t.estorno_de is null and t.is_paid
             and coalesce(t.notes, '') <> 'Estornada'
        ) x
       where s.origem = 'ATENDIMENTO' and s.e_paga
    ) pg on true
    left join lateral (
      -- D1/A1 da 19ª: os lançamentos vivos e pagos da venda paga à vista (no crediário e no a receber, a forma é a da venda).
      select array_agg(t.id) as ids
        from public.financial_transactions t
       where s.origem = 'VENDA' and coalesce(s.v_forma, '') not in ('CREDIARIO', 'A_RECEBER')
         and t.type::text = 'INCOME' and t.estorno_de is null and t.is_paid and coalesce(t.notes, '') <> 'Estornada'
         and (t.client_package_id = s.client_package_id or t.procedure_sale_id = s.procedure_sale_id
              or t.product_sale_id = s.product_sale_id or t.credito_vendido_id = s.credito_vendido_id)
    ) vp on true
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
