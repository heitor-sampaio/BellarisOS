-- A ficha de saúde não é pedida de novo logo depois de respondida
-- (2026-10-21, decisão do Heitor; atrito da simulação de um dia de clínica:
-- a cliente respondia e, no agendamento seguinte, já recebia o "algo mudou?").
--
-- Respondida (ou confirmada) há menos de 30 dias, o agendamento novo NÃO abre
-- pendente. Depois disso, segue a validade da rede: dentro dela, CONFIRMAR;
-- fora, COMPLETO. A última resposta é a mais recente entre a anamnese (a
-- equipe também responde) e os pré-atendimentos respondidos.

create or replace function private.pre_atendimento_no_agendamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_envio    boolean;
  v_validade int;
  v_ficha_id uuid;
  v_nome     text;
  v_esquema  jsonb;
  v_ultima   timestamptz;
  v_ficha_em timestamptz;
begin
  if new.client_id is null or new.status::text in ('CANCELLED', 'NO_SHOW') then return new; end if;

  select t.id, t.pre_atendimento_envio, t.pre_atendimento_validade_meses
    into v_tenant, v_envio, v_validade
    from public.branches b join public.tenants t on t.id = b.tenant_id
   where b.id = new.branch_id;
  if not coalesce(v_envio, false) then return new; end if;

  select f.id, f.name, f.schema into v_ficha_id, v_nome, v_esquema
    from public.forms f
   where f.tenant_id = v_tenant and f.tipo = 'PRE_ATENDIMENTO' and f.is_active;
  if v_ficha_id is null then return new; end if;

  -- A última resposta: a do formato novo, ou a data da anamnese antiga…
  select coalesce(nullif(mr.general_anamnesis ->> 'respondidoEm', ''), nullif(mr.general_anamnesis ->> 'updatedAt', ''))::timestamptz
    into v_ultima
    from public.medical_records mr where mr.client_id = new.client_id;
  -- …ou o pré-atendimento respondido mais recente, o que vier depois.
  select max(p.respondido_em) into v_ficha_em
    from public.pre_atendimentos p
   where p.client_id = new.client_id and p.status = 'RESPONDIDO';
  v_ultima := greatest(v_ultima, v_ficha_em);

  if v_ultima is not null and v_ultima > now() - interval '30 days' then return new; end if;

  insert into public.pre_atendimentos (tenant_id, client_id, appointment_id, modo, ficha)
  values (
    v_tenant, new.client_id, new.id,
    case when v_ultima is not null and v_ultima > now() - make_interval(months => v_validade) then 'CONFIRMAR' else 'COMPLETO' end,
    jsonb_build_object('formId', v_ficha_id, 'nome', v_nome, 'rows', coalesce(v_esquema -> 'rows', '[]'::jsonb))
  )
  on conflict do nothing;
  return new;
end $$;

notify pgrst, 'reload schema';
