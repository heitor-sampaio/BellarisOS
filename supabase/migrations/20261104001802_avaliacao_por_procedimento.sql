-- F17-3 (o Heitor, às decisões da F17: "a ser configurado pela clínica, mas,
-- a princípio, avaliação do atendimento e avaliação por procedimento também").
--
-- Até aqui a cliente dava, ao confirmar pelo app, duas notas opcionais NO
-- AGENDAMENTO: "Procedimento" (`appointments.procedure_rating`) e
-- "Profissional" (`appointments.client_rating`), mais o comentário. A sessão
-- de plano Botox + Preenchimento tinha UMA nota de procedimento, que ia para o
-- procedimento do agendamento.
--
-- Agora:
-- - `tenants.avaliacao_o_que` — o que a cliente avalia: OS_DOIS (o padrão), o
--   ATENDIMENTO ou cada um dos PROCEDIMENTOS (Configurações → Geral).
-- - A nota do ATENDIMENTO é `appointments.client_rating` (a "Profissional" de
--   antes, que já era do atendimento e da profissional): vale para o
--   atendimento e para a profissional.
-- - A nota de CADA procedimento feito no atendimento mora em
--   `avaliacoes_dos_procedimentos` (uma por procedimento distinto: o Botox que
--   aparece duas vezes na sessão é avaliado uma vez). Só o servidor lê e grava.
-- - `avaliar_atendimento` grava tudo numa transação, com o agendamento travado:
--   confirma, a nota do atendimento, o comentário e as dos procedimentos — e
--   recusa procedimento que não foi feito nele. O que a clínica não pede (a
--   configuração) não se grava.
-- - A régua da nota de cada procedimento é UMA,
--   `metrics_notas_dos_procedimentos(atendimento)`: as notas dadas a cada
--   procedimento; sem nenhuma, cada procedimento feito fica com a nota do
--   atendimento — "só o atendimento", princípio 3 —, e o procedimento do
--   agendamento com a nota de procedimento de antes, quando houver (as
--   avaliações já gravadas continuam valendo).
-- - A nota da profissional é a do atendimento; sem ela ("só cada
--   procedimento"), a média das notas dos procedimentos daquele atendimento.

alter table public.tenants
  add column if not exists avaliacao_o_que text not null default 'OS_DOIS';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_avaliacao_o_que_check') then
    alter table public.tenants add constraint tenants_avaliacao_o_que_check
      check (avaliacao_o_que in ('OS_DOIS', 'ATENDIMENTO', 'PROCEDIMENTOS'));
  end if;
end $$;

create table if not exists public.avaliacoes_dos_procedimentos (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  procedure_id   uuid not null references public.procedures(id) on delete cascade,
  nota           smallint not null check (nota between 1 and 5),
  created_at     timestamptz not null default now(),
  primary key (appointment_id, procedure_id)
);

alter table public.avaliacoes_dos_procedimentos enable row level security;

create policy suporte_sem_escrita_ins on public.avaliacoes_dos_procedimentos as restrictive for insert
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_upd on public.avaliacoes_dos_procedimentos as restrictive for update
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end)
  with check (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);
create policy suporte_sem_escrita_del on public.avaliacoes_dos_procedimentos as restrictive for delete
  using (case when nullif(nullif((auth.jwt() ->> 'session_id'), ''), 'null') is null then true else (not private.suporte_sem_escrita()) end);

-- A nota de cada procedimento do atendimento (a régua dos rankings).
create or replace function public.metrics_notas_dos_procedimentos(p_appointment uuid)
returns table (procedure_id uuid, nota numeric)
language sql
stable
set search_path to ''
as $$
  select r.procedure_id, r.nota::numeric
    from public.avaliacoes_dos_procedimentos r
   where r.appointment_id = p_appointment
  union all
  select e.procedure_id,
         coalesce(case when e.procedure_id = a.procedure_id then a.procedure_rating end, a.client_rating)::numeric
    from public.appointments a
    cross join lateral (
      select distinct x.procedure_id from public.metrics_procedimentos_executados(a.id, a.procedure_id) x
    ) e
   where a.id = p_appointment
     and not exists (select 1 from public.avaliacoes_dos_procedimentos r where r.appointment_id = p_appointment)
     and coalesce(case when e.procedure_id = a.procedure_id then a.procedure_rating end, a.client_rating) is not null
$$;

revoke execute on function public.metrics_notas_dos_procedimentos(uuid) from public, anon, authenticated;
grant execute on function public.metrics_notas_dos_procedimentos(uuid) to service_role;

-- Confirmar e avaliar: uma transação, o agendamento travado.
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
  for v_nota in select * from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) loop
    v_proc  := (v_nota ->> 'procedure_id')::uuid;
    v_valor := (v_nota ->> 'nota')::int;
    if v_valor is null or v_valor < 1 or v_valor > 5 then
      raise exception 'A nota vai de 1 a 5.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.metrics_procedimentos_executados(v_a.id, v_a.procedure_id) e where e.procedure_id = v_proc) then
      raise exception 'Esta avaliação tem um procedimento que não foi feito neste atendimento.' using errcode = 'P0001';
    end if;
    insert into public.avaliacoes_dos_procedimentos (appointment_id, procedure_id, nota)
    values (p_appointment, v_proc, v_valor)
    on conflict (appointment_id, procedure_id) do update set nota = excluded.nota;
  end loop;
end
$$;

revoke execute on function public.avaliar_atendimento(uuid, uuid, smallint, text, jsonb) from public, anon, authenticated;
grant execute on function public.avaliar_atendimento(uuid, uuid, smallint, text, jsonb) to service_role;

create function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end
$f$;

-- O ranking por procedimento: a nota de CADA procedimento do atendimento.
select pg_temp.trocar_no_corpo(
  'public.metrics_top_procedures(uuid,uuid[],timestamptz,timestamptz,integer,uuid)',
  array[
    E'  -- A nota é do atendimento: fica no procedimento dele.\n  notas as (\n    select a.procedure_id,\n           avg(a.procedure_rating) filter (where a.procedure_rating is not null) as nota,\n           count(*) filter (where a.procedure_rating is not null) as notas\n    from appt a\n    group by a.procedure_id\n  ),\n'
  ],
  array[
    E'  -- F17-3: a nota de cada procedimento do atendimento (metrics_notas_dos_procedimentos).\n  notas as (\n    select nn.procedure_id, avg(nn.nota) as nota, count(*) as notas\n    from appt a\n    cross join lateral public.metrics_notas_dos_procedimentos(a.id) nn\n    group by nn.procedure_id\n  ),\n'
  ],
  array[1]);

-- O ranking por profissional: a nota do atendimento; sem ela, a média das dos procedimentos.
select pg_temp.trocar_no_corpo(
  'public.metrics_top_professionals(uuid,uuid[],timestamptz,timestamptz,integer,uuid)',
  array[E'    select a.id, a.professional_id, a.price, a.client_rating\n'],
  array[E'    select a.id, a.professional_id, a.price,\n           coalesce(a.client_rating::numeric, (select avg(r.nota) from public.avaliacoes_dos_procedimentos r where r.appointment_id = a.id)) as client_rating\n'],
  array[1]);

notify pgrst, 'reload schema';
