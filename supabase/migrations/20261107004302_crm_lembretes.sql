-- A42 e A45 da 9ª simulação (2026-11-07). Princípio 6: nada se move sozinho —
-- são AVISOS para a pessoa (o sino de quem tem o lead), nunca o card andando.
--
-- A42: o lembrete de retorno da oportunidade. A Lívia (SDR) só tinha as
--   Observações para "ligar de novo na quinta". `retornar_em` (o dia) e
--   `retornar_obs` (o que fazer) moram no card; no dia, o cron avisa o
--   responsável (`retorno_avisado_em` marca o aviso — trocar a data o zera).
-- A45: quem tem o lead é lembrado de marcar o ganho quando a cliente ligada
--   compra (pacote, pré-pago ou plano aceito) depois de a oportunidade nascer,
--   com ela ainda aberta — a mesma régua da sugestão do card
--   (`crm_sinais_dos_clientes`, A18 da 7ª). Uma vez por oportunidade
--   (`ganho_lembrado_em`).

alter table public.leads
  add column if not exists retornar_em        date,
  add column if not exists retornar_obs       text,
  add column if not exists retorno_avisado_em timestamptz,
  add column if not exists ganho_lembrado_em  timestamptz;

comment on column public.leads.retornar_em is
  'A42 (9ª simulação): o dia combinado para retomar o contato. Lembrete para o responsável (o cron crm-lembretes), nunca movimento do card.';
comment on column public.leads.ganho_lembrado_em is
  'A45 (9ª simulação): quando o responsável foi lembrado de marcar o ganho (a cliente comprou com a oportunidade aberta).';

-- As oportunidades a lembrar do ganho: abertas (etapa sem desfecho), com
-- responsável, a cliente ligada comprou DEPOIS de a oportunidade nascer, e
-- ainda sem o lembrete. Só o servidor (o cron).
create or replace function public.crm_lembretes_de_ganho(p_limite integer default 500)
 returns table(lead_id uuid, tenant_id uuid, owner_id uuid, nome text, compra text, compra_em timestamptz)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with abertas as (
    select l.id, l.tenant_id, l.owner_id, l.name, l.client_id, l.created_at
      from public.leads l
      left join public.crm_stages s on s.id = l.crm_stage_id
     where l.client_id is not null
       and l.owner_id is not null
       and l.ganho_lembrado_em is null
       and coalesce(s.outcome, 'OPEN') not in ('WON', 'LOST')
  ), compras as (
    select cp.client_id, cp.purchased_at as em, 'Pacote ' || coalesce(sp.name, '') as o_que
      from public.client_packages cp
      join abertas a on a.client_id = cp.client_id
      left join public.service_packages sp on sp.id = cp.package_id
     where cp.cancelado_em is null and cp.purchased_at is not null
    union all
    select ps.client_id, ps.sold_at, coalesce(pr.name, 'Procedimento') || ' (pré-pago)'
      from public.procedure_sales ps
      join abertas a on a.client_id = ps.client_id
      left join public.procedures pr on pr.id = ps.procedure_id
     where ps.sold_at is not null
    union all
    select tp.client_id, tp.aceito_em,
           case when nullif(trim(tp.name), '') is null then 'Plano de tratamento'
                when tp.name ilike 'plano%' then trim(tp.name) else 'Plano ' || trim(tp.name) end
      from public.treatment_plans tp
      join abertas a on a.client_id = tp.client_id
     where tp.aceito_em is not null and tp.status <> 'CANCELLED'
  ), ultima as (
    select distinct on (k.client_id) k.client_id, k.em, k.o_que from compras k order by k.client_id, k.em desc
  )
  select a.id, a.tenant_id, a.owner_id, a.name::text, u.o_que, u.em
    from abertas a
    join ultima u on u.client_id = a.client_id
   where u.em >= a.created_at
   order by u.em
   limit greatest(p_limite, 1);
$function$;

revoke execute on function public.crm_lembretes_de_ganho(integer) from public, anon, authenticated;
grant execute on function public.crm_lembretes_de_ganho(integer) to service_role;

-- O que já estava assim antes do lembrete existir não vira uma enxurrada de
-- avisos no primeiro cron: o card já sugeria "Mover para Fechado" (A18 da 7ª).
update public.leads l
   set ganho_lembrado_em = now()
  from public.crm_lembretes_de_ganho(100000) g
 where l.id = g.lead_id;

notify pgrst, 'reload schema';
