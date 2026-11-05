-- O que o card da oportunidade diz da cliente ligada (A18 da 7ª simulação,
-- 2026-11-05). O card com avaliação agendada só ganhava "✓ Cliente", sem
-- "Agendado 06/11 10:30"; e a venda do pacote, do pré-pago ou do plano não
-- sugeria levar o card a Ganho — a conversão ficava em 0% até alguém lembrar.
-- Nenhum card anda sozinho (crm-05, princípio 6): o banco só diz o próximo
-- agendamento e a última compra; quem move é a pessoa, no botão do card.
--
-- Uma passada para a lista inteira (a lista de clientes vai no CORPO, por rpc:
-- no `.in()` ela iria na URL). Só o servidor chama.

create or replace function public.crm_sinais_dos_clientes(p_tenant uuid, p_clientes uuid[])
 returns table(client_id uuid, proximo_agendamento timestamptz, compra_em timestamptz, compra text)
 language sql
 stable
 security definer
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
    select cp.client_id, cp.purchased_at as em, 'Pacote ' || coalesce(sp.name, '') as o_que
      from public.client_packages cp
      join c on c.id = cp.client_id
      left join public.service_packages sp on sp.id = cp.package_id
     where cp.cancelado_em is null and cp.purchased_at is not null
    union all
    select ps.client_id, ps.sold_at, coalesce(pr.name, 'Procedimento') || ' (pré-pago)'
      from public.procedure_sales ps
      join c on c.id = ps.client_id
      left join public.procedures pr on pr.id = ps.procedure_id
     where ps.tenant_id = p_tenant and ps.sold_at is not null
    union all
    select tp.client_id, tp.aceito_em,
           case when nullif(trim(tp.name), '') is null then 'Plano de tratamento'
                when tp.name ilike 'plano%' then trim(tp.name) else 'Plano ' || trim(tp.name) end
      from public.treatment_plans tp
      join c on c.id = tp.client_id
     where tp.aceito_em is not null and tp.status <> 'CANCELLED'
  ), ultima as (
    select distinct on (k.client_id) k.client_id, k.em, k.o_que from compras k order by k.client_id, k.em desc
  )
  select c.id, ag.scheduled_at, ultima.em, ultima.o_que
    from c
    left join ag on ag.client_id = c.id
    left join ultima on ultima.client_id = c.id
   where ag.scheduled_at is not null or ultima.em is not null;
$function$;

revoke execute on function public.crm_sinais_dos_clientes(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.crm_sinais_dos_clientes(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
