-- A49 da 6ª simulação (2026-11-04): a ficha de pré-atendimento se manda À MÃO,
-- pela janela do agendamento, mesmo com o envio automático da rede desligado
-- (o padrão continua desligado — princípio 6). Sem isto, o "Enviar a ficha"
-- só existia com um pendente, e o pendente só nascia pelo gatilho do envio.
--
-- Abre o pendente para ESTE agendamento, com o retrato da ficha do momento e o
-- modo do gatilho (CONFIRMAR dentro da validade da rede; senão COMPLETO). Não
-- aplica a janela de 30 dias do envio automático: aqui é a clínica que pediu
-- (princípio 1). Já havendo um pendente da cliente (um por cliente), devolve
-- esse. Só o servidor chama (a rede vem por parâmetro).

create or replace function public.pre_atendimento_abrir_manual(p_tenant uuid, p_appointment uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cliente  uuid;
  v_status   text;
  v_validade int;
  v_ficha_id uuid;
  v_nome     text;
  v_esquema  jsonb;
  v_ultima   timestamptz;
  v_ficha_em timestamptz;
  v_id       uuid;
begin
  select a.client_id, a.status::text, t.pre_atendimento_validade_meses
    into v_cliente, v_status, v_validade
    from public.appointments a
    join public.branches b on b.id = a.branch_id
    join public.tenants t on t.id = b.tenant_id
   where a.id = p_appointment and b.tenant_id = p_tenant;
  if v_cliente is null then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_status in ('CANCELLED', 'NO_SHOW') then
    raise exception 'O agendamento foi cancelado: a ficha não se manda por ele.' using errcode = 'check_violation';
  end if;

  select p.id into v_id from public.pre_atendimentos p
   where p.client_id = v_cliente and p.tenant_id = p_tenant and p.status = 'PENDENTE';
  if v_id is not null then return v_id; end if;

  select f.id, f.name, f.schema into v_ficha_id, v_nome, v_esquema
    from public.forms f
   where f.tenant_id = p_tenant and f.tipo = 'PRE_ATENDIMENTO' and f.is_active;
  if v_ficha_id is null then
    raise exception 'A clínica não tem ficha de pré-atendimento ativa.' using errcode = 'check_violation';
  end if;

  -- A última resposta: a mesma conta do gatilho do envio (a ficha gravada vazia não conta).
  select case
           when mr.general_anamnesis ->> 'versao' = '2'
            and coalesce(mr.general_anamnesis -> 'respostas', '{}'::jsonb) = '{}'::jsonb then null
           else coalesce(nullif(mr.general_anamnesis ->> 'respondidoEm', ''), nullif(mr.general_anamnesis ->> 'updatedAt', ''))::timestamptz
         end
    into v_ultima
    from public.medical_records mr where mr.client_id = v_cliente;
  select max(p.respondido_em) into v_ficha_em
    from public.pre_atendimentos p
   where p.client_id = v_cliente and p.status = 'RESPONDIDO'
     and coalesce(p.respostas, '{}'::jsonb) <> '{}'::jsonb;
  v_ultima := greatest(v_ultima, v_ficha_em);

  insert into public.pre_atendimentos (tenant_id, client_id, appointment_id, modo, ficha)
  values (
    p_tenant, v_cliente, p_appointment,
    case when v_ultima is not null and v_ultima > now() - make_interval(months => coalesce(v_validade, 6)) then 'CONFIRMAR' else 'COMPLETO' end,
    jsonb_build_object('formId', v_ficha_id, 'nome', v_nome, 'rows', coalesce(v_esquema -> 'rows', '[]'::jsonb))
  )
  on conflict do nothing
  returning id into v_id;

  -- Corrida com outro pendente aberto no mesmo instante: vale o que ficou.
  if v_id is null then
    select p.id into v_id from public.pre_atendimentos p
     where p.client_id = v_cliente and p.tenant_id = p_tenant and p.status = 'PENDENTE';
  end if;
  return v_id;
end $function$;

revoke execute on function public.pre_atendimento_abrir_manual(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pre_atendimento_abrir_manual(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
