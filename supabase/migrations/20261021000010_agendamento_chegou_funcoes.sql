-- "Chegou" (ARRIVED) nas funções que listam status (2026-10-21).
--
-- - documentos_no_agendamento: chegar emite os documentos do INÍCIO do
--   atendimento, como confirmar emitia (o check-in gravava CONFIRMED). Passar
--   de Confirmado a Chegou não emite de novo.
-- - metrics_clientes_para_reativar: quem chegou tem agendamento em curso.

create or replace function private.documentos_no_agendamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.treatment_plan_id is not null then return null; end if;

  if tg_op = 'INSERT' then
    perform public.documentos_emitir_do_atendimento(new.id,
      case when new.status::text in ('CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
           then array['AGENDAMENTO', 'INICIO_ATENDIMENTO'] else array['AGENDAMENTO'] end);
    return null;
  end if;

  if new.status in ('CANCELLED', 'NO_SHOW') and old.status is distinct from new.status then
    perform private.documentos_cancelar_do_atendimento(new.id,
      case new.status when 'CANCELLED' then 'Agendamento cancelado' else 'Cliente não compareceu' end, null);
    return null;
  end if;

  if new.procedure_id is distinct from old.procedure_id then
    perform private.documentos_cancelar_do_atendimento(new.id, 'Procedimento trocado', new.procedure_id);
    perform public.documentos_emitir_do_atendimento(new.id,
      case when new.status::text in ('CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
           then array['AGENDAMENTO', 'INICIO_ATENDIMENTO'] else array['AGENDAMENTO'] end);
  end if;

  if new.status::text in ('CONFIRMED', 'ARRIVED') and old.status::text not in ('CONFIRMED', 'ARRIVED') then
    perform public.documentos_emitir_do_atendimento(new.id, array['AGENDAMENTO', 'INICIO_ATENDIMENTO']);
  end if;
  return null;
end $function$;

create or replace function public.metrics_clientes_para_reativar(p_tenant uuid, p_branch_id uuid, p_tag text, p_desde timestamp with time zone, p_limite integer default 3)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with da_unidade as (
    select c.id, c.name, c.phone
    from public.clients c
    where c.tenant_id = p_tenant and c.is_active and c.tags @> array[p_tag]
  ),
  inativos as (
    select d.*
    from da_unidade d
    where not exists (
      select 1 from public.appointments a
      where a.client_id = d.id
        and a.branch_id = p_branch_id
        and a.status in ('COMPLETED', 'SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
        and a.scheduled_at >= p_desde
    )
  ),
  com_ultima as (
    select i.id, i.name, i.phone,
      (select max(a.scheduled_at) from public.appointments a
        where a.client_id = i.id and a.status = 'COMPLETED') as ultima_visita
    from inativos i
  )
  select jsonb_build_object(
    'total', (select count(*) from inativos),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'name', x.name, 'phone', x.phone, 'ultima_visita', x.ultima_visita)
             order by x.ultima_visita asc nulls last, x.name)
      from (
        select * from com_ultima
        order by ultima_visita asc nulls last, name
        limit p_limite
      ) x
    ), '[]'::jsonb)
  );
$function$;

notify pgrst, 'reload schema';
