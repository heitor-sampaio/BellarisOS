-- F17-3: as notas dos procedimentos na ORDEM em que a cliente as viu (a da
-- sessão do plano). Na mesma transação o `created_at` é o mesmo para todas, e
-- a tela as mostrava em ordem de id.

alter table public.avaliacoes_dos_procedimentos add column if not exists ordem smallint not null default 0;

create or replace function public.avaliar_atendimento(
  p_appointment uuid, p_client uuid, p_nota_atendimento smallint, p_comentario text, p_notas jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_a        record;
  v_o_que    text;
  v_nota     jsonb;
  v_ordem    bigint;
  v_proc     uuid;
  v_valor    int;
begin
  select a.id, a.client_id, a.status, a.client_confirmed_at, a.procedure_id, b.tenant_id
    into v_a
    from public.appointments a join public.branches b on b.id = a.branch_id
   where a.id = p_appointment
   for update of a;
  if not found then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0001';
  end if;
  if v_a.client_id is distinct from p_client then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0001';
  end if;
  if v_a.status <> 'COMPLETED' then
    raise exception 'Este atendimento ainda não foi concluído.' using errcode = 'P0001';
  end if;
  if v_a.client_confirmed_at is not null then
    raise exception 'Você já confirmou este atendimento.' using errcode = 'P0001';
  end if;
  select t.avaliacao_o_que into v_o_que from public.tenants t where t.id = v_a.tenant_id;
  v_o_que := coalesce(v_o_que, 'OS_DOIS');

  update public.appointments
     set client_confirmed_at = now(),
         client_rating = case when v_o_que = 'PROCEDIMENTOS' then null else p_nota_atendimento end,
         client_feedback = nullif(btrim(coalesce(p_comentario, '')), '')
   where id = p_appointment;

  if v_o_que = 'ATENDIMENTO' then
    return;
  end if;
  for v_nota, v_ordem in select e.value, e.ordinality from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) with ordinality e loop
    v_proc  := (v_nota ->> 'procedure_id')::uuid;
    v_valor := (v_nota ->> 'nota')::int;
    if v_valor is null or v_valor < 1 or v_valor > 5 then
      raise exception 'A nota vai de 1 a 5.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.metrics_procedimentos_executados(v_a.id, v_a.procedure_id) e where e.procedure_id = v_proc) then
      raise exception 'Esta avaliação tem um procedimento que não foi feito neste atendimento.' using errcode = 'P0001';
    end if;
    insert into public.avaliacoes_dos_procedimentos (appointment_id, procedure_id, nota, ordem)
    values (p_appointment, v_proc, v_valor, v_ordem)
    on conflict (appointment_id, procedure_id) do update set nota = excluded.nota, ordem = excluded.ordem;
  end loop;
end
$$;

revoke execute on function public.avaliar_atendimento(uuid, uuid, smallint, text, jsonb) from public, anon, authenticated;
grant execute on function public.avaliar_atendimento(uuid, uuid, smallint, text, jsonb) to service_role;

notify pgrst, 'reload schema';
