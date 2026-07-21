-- Unidade que o cliente frequenta = TAG "Unidade: <nome>" (métrica), não regra de negócio.
-- Auto-derivada: ao criar um agendamento, adiciona a tag da filial do agendamento ao cliente.
-- (Também editável manualmente na ficha.) Um cliente pode frequentar várias unidades.

create or replace function public.on_appointment_add_unit_tag()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare bname text;
begin
  select name into bname from public.branches where id = new.branch_id;
  if bname is not null then
    update public.clients
      set tags = array_append(tags, 'Unidade: ' || bname)
      where id = new.client_id
        and not (('Unidade: ' || bname) = any(tags));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_appointment_unit_tag on public.appointments;
create trigger trg_appointment_unit_tag
  after insert on public.appointments
  for each row execute function public.on_appointment_add_unit_tag();

create index if not exists idx_clients_tags on public.clients using gin (tags);

-- Backfill: mescla nas tags existentes as unidades dos appointments + a filial de cadastro.
update public.clients c
set tags = sub.merged
from (
  select c2.id,
    array(
      select distinct x from unnest(
        c2.tags
        || coalesce((
             select array_agg(distinct 'Unidade: ' || b.name)
             from public.appointments a
             join public.branches b on b.id = a.branch_id
             where a.client_id = c2.id
           ), '{}'::text[])
        || coalesce((
             select array_agg('Unidade: ' || b.name)
             from public.branches b where b.id = c2.branch_id
           ), '{}'::text[])
      ) x
    ) as merged
  from public.clients c2
) sub
where sub.id = c.id
  and c.tags is distinct from sub.merged;
