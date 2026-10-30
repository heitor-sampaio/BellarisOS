-- Retenção "só os meus": "a cliente é da clínica, o atendimento é da
-- profissional" (decisão do Heitor, 2026-10-29). Com p_professional_id, as
-- clientes servidas são as que ELA atendeu no período (como antes), e
-- "voltou" é quem já tinha sido atendida pela CLÍNICA antes do período — por
-- qualquer profissional, nas unidades do recorte. Até aqui o histórico também
-- era recortado nela (migration 20261028000804: "já tinha vindo a ELA"), e a
-- cliente que trocou de profissional contava como primeira vez.
--
-- Mesma assinatura: create or replace. Só service_role, como antes.

create or replace function public.metrics_retention(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_professional_id uuid default null)
 returns table(clients_served bigint, returning_clients bigint, first_time_clients bigint)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  with scope as (
    select b.id from public.branches b
    where b.tenant_id = p_tenant
      and (p_branch_ids is null or b.id = any (p_branch_ids))
  ),
  served as (
    -- O atendimento é da profissional: as clientes que ELA atendeu no período.
    select distinct a.client_id
    from public.appointments a
    join scope s on s.id = a.branch_id
    where a.status = 'COMPLETED'
      and a.client_id is not null
      and a.aconteceu_em between p_from and p_to
      and (p_professional_id is null or a.professional_id = p_professional_id)
  ),
  had_history as (
    -- A cliente é da clínica: voltou quem a CLÍNICA já tinha atendido antes.
    select sv.client_id
    from served sv
    where exists (
      select 1
      from public.appointments a2
      join scope s2 on s2.id = a2.branch_id
      where a2.client_id = sv.client_id
        and a2.status = 'COMPLETED'
        and a2.aconteceu_em < p_from
    )
  )
  select
    (select count(*) from served),
    (select count(*) from had_history),
    (select count(*) from served) - (select count(*) from had_history);
$function$;

revoke execute on function public.metrics_retention(uuid, uuid[], timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.metrics_retention(uuid, uuid[], timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
