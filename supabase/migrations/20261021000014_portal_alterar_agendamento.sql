-- A cliente cancela e remarca pelo portal até um prazo da rede (2026-10-21,
-- decisão do Heitor: 24h por padrão, configurável).
--
-- E cancelar (ou faltar) devolve o que estava pago: o pré-pago já voltava a
-- ficar livre (private.pre_pago_libera); a sessão de PACOTE e a de PLANO
-- ficavam presas a um agendamento cancelado — não dava para agendá-las de
-- novo ("Sessão já está agendada"). Vale para a equipe e para a cliente.

alter table public.tenants
  add column if not exists portal_prazo_alteracao_horas integer not null default 24;
alter table public.tenants drop constraint if exists tenants_portal_prazo_alteracao;
alter table public.tenants add constraint tenants_portal_prazo_alteracao
  check (portal_prazo_alteracao_horas between 0 and 720);

create or replace function private.pre_pago_libera()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.status::text in ('CANCELLED', 'NO_SHOW') and old.status::text is distinct from new.status::text then
    update public.procedure_sale_units
       set appointment_id = null
     where appointment_id = new.id and status = 'DISPONIVEL';
    update public.package_sessions
       set appointment_id = null
     where appointment_id = new.id and status = 'AVAILABLE';
    update public.treatment_plan_sessions
       set appointment_id = null
     where appointment_id = new.id;
  end if;
  return new;
end $function$;

notify pgrst, 'reload schema';
