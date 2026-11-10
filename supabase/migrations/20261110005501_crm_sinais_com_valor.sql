-- A4 da 11ª simulação (2026-11-10): depois do plano de R$ 8.400, o card da
-- Beatriz seguia com R$ 2.600 (o procedimento de interesse). O card passa a
-- dizer o VENDIDO da compra que ele já sugere marcar como ganho (princípio 3).
--
-- `crm_sinais_dos_clientes` não muda (o cron `crm-lembretes` e a função dos
-- lembretes a usam, e trocar o RETURNS TABLE exigiria derrubá-la): a função
-- nova é a MESMA conta com o valor da compra ao lado. O valor é o vendido:
-- o pacote (`client_packages.price` menos o cancelado), o pré-pago
-- (`procedure_sales.price`) e o plano (a soma dos procedimentos das sessões,
-- o preço vendido — o desconto já rateado no checkout — menos o cancelado).

create or replace function public.crm_sinais_do_quadro(p_tenant uuid, p_clientes uuid[])
returns table(client_id uuid, proximo_agendamento timestamptz, compra_em timestamptz, compra text, compra_valor numeric)
language sql
stable security definer
set search_path to ''
as $function$
  with c as (
    select x.id from public.clients x where x.tenant_id = p_tenant and x.id = any (p_clientes)
  ), ag as (
    select distinct on (a.client_id) a.client_id, a.scheduled_at
      from public.appointments a
      join c on c.id = a.client_id
     where a.status::text in ('SCHEDULED', 'CONFIRMED', 'ARRIVED')
       and a.scheduled_at >= now()
     order by a.client_id, a.scheduled_at
  ), compras as (
    select cp.client_id, cp.purchased_at as em, 'Pacote ' || coalesce(sp.name, '') as o_que,
           greatest(coalesce(cp.price, 0) - coalesce(cp.valor_cancelado, 0), 0) as valor
      from public.client_packages cp
      join c on c.id = cp.client_id
      left join public.service_packages sp on sp.id = cp.package_id
     where cp.cancelado_em is null and cp.purchased_at is not null
    union all
    select ps.client_id, ps.sold_at, coalesce(pr.name, 'Procedimento') || ' (pré-pago)',
           coalesce(ps.price, 0)
      from public.procedure_sales ps
      join c on c.id = ps.client_id
      left join public.procedures pr on pr.id = ps.procedure_id
     where ps.tenant_id = p_tenant and ps.sold_at is not null
    union all
    select tp.client_id, tp.aceito_em,
           case when nullif(trim(tp.name), '') is null then 'Plano de tratamento'
                when tp.name ilike 'plano%' then trim(tp.name) else 'Plano ' || trim(tp.name) end,
           greatest(coalesce((select sum(sp2.price)
                                from public.treatment_plan_sessions s
                                join public.treatment_plan_session_procedures sp2 on sp2.session_id = s.id
                               where s.plan_id = tp.id), 0) - coalesce(tp.valor_cancelado, 0), 0)
      from public.treatment_plans tp
      join c on c.id = tp.client_id
     where tp.aceito_em is not null and tp.status <> 'CANCELLED'
  ), ultima as (
    select distinct on (k.client_id) k.client_id, k.em, k.o_que, k.valor from compras k order by k.client_id, k.em desc
  )
  select c.id, ag.scheduled_at, ultima.em, ultima.o_que, ultima.valor
    from c
    left join ag on ag.client_id = c.id
    left join ultima on ultima.client_id = c.id
   where ag.scheduled_at is not null or ultima.em is not null;
$function$;

revoke execute on function public.crm_sinais_do_quadro(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.crm_sinais_do_quadro(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
