-- D2 da simulação de 2026-10-28: a ficha de saúde não se responde vazia.
--
-- A cliente enviava a ficha de pré-atendimento sem resposta nenhuma; a
-- clínica ficava com `respostas {}` e o atendimento dizia "Anamnese revisada".
-- A ficha padrão da rede não tinha NENHUM campo obrigatório.
--
--  1. A ficha padrão nasce com as contraindicações clínicas obrigatórias:
--     alergias, gestação/amamentação, medicamentos em uso e condições de
--     saúde. O resto (pele, protetor, procedimentos anteriores, observações)
--     segue opcional.
--  2. Nas redes que já existem, só a ficha padrão que NUNCA foi editada (igual
--     à semente antiga, campo a campo) ganha as obrigatórias. A ficha que a
--     rede mexeu é dela: não se toca. Contadas antes de aplicar (2026-10-28):
--     três redes reais com a ficha intacta ([sim] Clínica Íris, AgapeFlow,
--     Bellaris Clinic), mais as `[e2e]` de rodada; a [sim] Clínica Aurora
--     editou a sua e fica como está.
--  3. A ficha gravada VAZIA não conta como respondida para o envio ao agendar:
--     nem a anamnese (`respostas` vazias) nem o pré-atendimento respondido sem
--     resposta abrem a janela de 30 dias nem o "algo mudou?".

-- ─── 1. A semente ───────────────────────────────────────────────────────────

-- O corpo de antes, guardado para reconhecer a ficha nunca editada.
create or replace function private.ficha_de_pre_atendimento_padrao_2026_10_20()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('rows', jsonb_build_array(
    jsonb_build_object('id', 'linha-1', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'skinType', 'type', 'select', 'label', 'Tipo de pele',
        'options', jsonb_build_array('Normal', 'Seca', 'Oleosa', 'Mista', 'Sensível')),
      jsonb_build_object('id', 'useSunscreen', 'type', 'radio', 'label', 'Usa protetor solar?',
        'options', jsonb_build_array('Sim', 'Não')),
      jsonb_build_object('id', 'isPregnantOrBreastfeeding', 'type', 'radio', 'label', 'Grávida ou amamentando?',
        'options', jsonb_build_array('Sim', 'Não')))),
    jsonb_build_object('id', 'linha-2', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'allergies', 'type', 'textarea', 'label', 'Alergias'),
      jsonb_build_object('id', 'medications', 'type', 'textarea', 'label', 'Medicamentos em uso'))),
    jsonb_build_object('id', 'linha-3', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'healthConditions', 'type', 'textarea', 'label', 'Condições de saúde'),
      jsonb_build_object('id', 'previousProcedures', 'type', 'textarea', 'label', 'Procedimentos estéticos anteriores'))),
    jsonb_build_object('id', 'linha-4', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'observations', 'type', 'textarea', 'label', 'Observações gerais')))
  ))
$$;

create or replace function private.ficha_de_pre_atendimento_padrao()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('rows', jsonb_build_array(
    jsonb_build_object('id', 'linha-1', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'skinType', 'type', 'select', 'label', 'Tipo de pele',
        'options', jsonb_build_array('Normal', 'Seca', 'Oleosa', 'Mista', 'Sensível')),
      jsonb_build_object('id', 'useSunscreen', 'type', 'radio', 'label', 'Usa protetor solar?',
        'options', jsonb_build_array('Sim', 'Não')),
      jsonb_build_object('id', 'isPregnantOrBreastfeeding', 'type', 'radio', 'label', 'Grávida ou amamentando?',
        'options', jsonb_build_array('Sim', 'Não'), 'required', true))),
    jsonb_build_object('id', 'linha-2', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'allergies', 'type', 'textarea', 'label', 'Alergias', 'required', true),
      jsonb_build_object('id', 'medications', 'type', 'textarea', 'label', 'Medicamentos em uso', 'required', true))),
    jsonb_build_object('id', 'linha-3', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'healthConditions', 'type', 'textarea', 'label', 'Condições de saúde', 'required', true),
      jsonb_build_object('id', 'previousProcedures', 'type', 'textarea', 'label', 'Procedimentos estéticos anteriores'))),
    jsonb_build_object('id', 'linha-4', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'observations', 'type', 'textarea', 'label', 'Observações gerais')))
  ))
$$;

-- ─── 2. As fichas nunca editadas ────────────────────────────────────────────

update public.forms f
   set schema = private.ficha_de_pre_atendimento_padrao(), updated_at = now()
 where f.tipo = 'PRE_ATENDIMENTO'
   and f.schema = private.ficha_de_pre_atendimento_padrao_2026_10_20();

drop function private.ficha_de_pre_atendimento_padrao_2026_10_20();

-- ─── 3. Vazia não é respondida ──────────────────────────────────────────────
-- O corpo é o da produção (20261021000008), mudando só as duas leituras da
-- "última resposta".

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

  -- A anamnese no formato da ficha (versao 2) só conta com ao menos uma
  -- resposta; a de campos fixos (legado) conta como sempre contou.
  select case
           when mr.general_anamnesis ->> 'versao' = '2'
            and coalesce(mr.general_anamnesis -> 'respostas', '{}'::jsonb) = '{}'::jsonb then null
           else coalesce(nullif(mr.general_anamnesis ->> 'respondidoEm', ''), nullif(mr.general_anamnesis ->> 'updatedAt', ''))::timestamptz
         end
    into v_ultima
    from public.medical_records mr where mr.client_id = new.client_id;
  select max(p.respondido_em) into v_ficha_em
    from public.pre_atendimentos p
   where p.client_id = new.client_id and p.status = 'RESPONDIDO'
     and coalesce(p.respostas, '{}'::jsonb) <> '{}'::jsonb;
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
