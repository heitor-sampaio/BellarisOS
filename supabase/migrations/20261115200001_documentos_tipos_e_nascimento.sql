-- Bloco Documentos, leva 1 (2026-11-14) — a revisão do Heitor de 13/11
-- (docs/revisao.md, "Bloco: Documentos"):
--
-- DC1  Os tipos são cinco: TERMO, CONTRATO (do procedimento, só no avulso),
--      CONTRATO_PLANO, CONTRATO_PACOTE (novo: um ativo por rede, trocado por
--      "Tornar ativo", como o de plano — PC9a) e DOCUMENTO (novo: o "outro
--      documento", com as variáveis do termo).
-- DC1b O procedimento liga, além do termo e do contrato, "Outros documentos"
--      (PR4/PC7/PC8): `procedures.outros_documentos`, uma lista de modelos
--      da rede (termo, contrato do procedimento ou documento). Coluna, não
--      tabela procedimento × modelo: a tabela com chave estrangeira para
--      `procedures` e `document_templates` viraria junção no PostgREST
--      (PGRST201, CLAUDE.md §14) — a mesma escolha do `users.atende_em`.
-- DC2  Toda rede nasce com o contrato de pacote padrão, ao lado do de plano.
--      As redes que já têm o de plano padrão ganham o de pacote aqui.
-- DC4  Sai o "quando nasce": todo documento do atendimento nasce AO AGENDAR
--      (o INSERT). Saem a coluna `document_templates.moment` (DESTRUTIVA —
--      "aplica e anota"), a emissão do check-in (ARRIVED) e a da trava do
--      início. A sessão de PACOTE não emite (PC2: assina-se pelo pacote, na
--      venda — leva 2): ligada ao pacote, os documentos abertos do agendamento
--      saem (CANCELADO, com o motivo). A de plano já não emitia.

-- ─── DC1: os tipos ───────────────────────────────────────────────────────────

alter table public.document_templates drop constraint document_templates_kind_check;
alter table public.document_templates add constraint document_templates_kind_check
  check (kind = any (array['TERMO', 'CONTRATO', 'CONTRATO_PLANO', 'CONTRATO_PACOTE', 'DOCUMENTO']));

alter table public.issued_documents drop constraint issued_documents_kind_check;
alter table public.issued_documents add constraint issued_documents_kind_check
  check (kind = any (array['TERMO', 'CONTRATO', 'CONTRATO_PLANO', 'CONTRATO_PACOTE', 'DOCUMENTO']));

-- Um contrato de pacote ativo por rede (o de plano já tem o dele).
create unique index uniq_contrato_de_pacote_ativo on public.document_templates (tenant_id)
  where kind = 'CONTRATO_PACOTE' and is_active;

-- ─── DC4: o modelo não diz mais "quando nasce" ───────────────────────────────

alter table public.document_templates drop constraint document_templates_momento_do_tipo;
alter table public.document_templates drop constraint document_templates_moment_check;
alter table public.document_templates drop column moment;
-- (`issued_documents.moment` fica: é o fato de onde o documento nasceu —
-- AGENDAMENTO, FECHAMENTO_PLANO, LEGADO; os INICIO_ATENDIMENTO de antes ficam.)

-- ─── DC1b: os outros documentos do procedimento ──────────────────────────────

alter table public.procedures add column outros_documentos uuid[] not null default '{}';

comment on column public.procedures.outros_documentos is
  'Bloco Documentos (DC1b/PC7): os "Outros documentos" que o procedimento pede além do termo e do contrato — modelos da rede do tipo TERMO, CONTRATO ou DOCUMENTO. Nascem ao agendar o atendimento avulso. O gatilho procedimento_modelos_do_tipo confere.';

create or replace function private.procedimento_modelos_do_tipo()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_tipo      text;
  v_invalidos int;
begin
  if new.consent_template_id is not null then
    select t.kind into v_tipo from public.document_templates t where t.id = new.consent_template_id;
    if v_tipo is distinct from 'TERMO' then
      raise exception 'O termo do procedimento tem de ser um modelo de termo de consentimento.' using errcode = 'P0001';
    end if;
  end if;
  if new.contract_template_id is not null then
    select t.kind into v_tipo from public.document_templates t where t.id = new.contract_template_id;
    if v_tipo is distinct from 'CONTRATO' then
      raise exception 'O contrato do procedimento tem de ser um modelo de contrato do procedimento.' using errcode = 'P0001';
    end if;
  end if;
  if coalesce(cardinality(new.outros_documentos), 0) > 0 then
    if cardinality(new.outros_documentos) <> (select count(distinct o.x) from unnest(new.outros_documentos) as o(x)) then
      raise exception 'Outros documentos: o mesmo documento aparece duas vezes.' using errcode = 'P0001';
    end if;
    -- Da MESMA rede, e só o que se liga a procedimento: os contratos de plano
    -- e de pacote são da rede inteira, não de um procedimento.
    select count(*) into v_invalidos
      from unnest(new.outros_documentos) as o(x)
     where not exists (select 1 from public.document_templates t
                        where t.id = o.x and t.tenant_id = new.tenant_id
                          and t.kind in ('TERMO', 'CONTRATO', 'DOCUMENTO'));
    if v_invalidos > 0 then
      raise exception 'Outros documentos: só termo, contrato do procedimento ou documento desta rede.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$;

drop trigger trg_procedimento_modelos_do_tipo on public.procedures;
create trigger trg_procedimento_modelos_do_tipo
  before insert or update of consent_template_id, contract_template_id, outros_documentos on public.procedures
  for each row execute function private.procedimento_modelos_do_tipo();

-- ─── DC4: tudo nasce ao agendar ──────────────────────────────────────────────

-- A trava do início deixa de emitir (era o D7 da 9ª): o documento já nasceu
-- ao agendar. Ela só confere.
create or replace function private.documentos_bloqueiam_inicio()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_faltam text;
begin
  if new.treatment_plan_id is not null then return new; end if;
  if not (
    (new.status = 'IN_PROGRESS' and old.status is distinct from 'IN_PROGRESS') or
    (new.status = 'COMPLETED' and old.status not in ('IN_PROGRESS', 'COMPLETED'))
  ) then
    return new;
  end if;

  select string_agg(p.title, ', ' order by p.title) into v_faltam
    from public.documentos_pendentes_do_atendimento(new.id) p
   where p.enforcement = 'BLOQUEIA';

  if v_faltam is not null then
    raise exception 'Falta assinar: %. Colha a assinatura antes de iniciar o atendimento.', v_faltam
      using errcode = 'P0001';
  end if;
  return new;
end $function$;

-- Os modelos do atendimento AVULSO: o termo, o contrato e os outros
-- documentos do procedimento. Sem "momento". A sessão de plano e a de pacote
-- não pedem documento (o plano e o pacote têm os deles).
create or replace function private.modelos_do_atendimento(p_agendamento uuid)
 returns table(template_id uuid, version_id uuid, kind text, source text, title text, enforcement text, procedure_id uuid)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select distinct on (t.id) t.id, v.id, t.kind, t.source, t.name, t.enforcement, a.procedure_id
    from public.appointments a
    join public.procedures p on p.id = a.procedure_id
    join public.document_templates t
      on t.tenant_id = p.tenant_id
     and (t.id = p.consent_template_id or t.id = p.contract_template_id or t.id = any (p.outros_documentos))
    join public.document_template_versions v on v.template_id = t.id and v.version = t.current_version
   where a.id = p_agendamento
     and a.treatment_plan_id is null
     and not exists (select 1 from public.package_sessions s where s.appointment_id = a.id)
     and t.is_active
     and t.kind in ('TERMO', 'CONTRATO', 'DOCUMENTO')
   order by t.id
$function$;

revoke execute on function private.modelos_do_atendimento(uuid) from public, anon, authenticated;

create or replace function public.documentos_emitir_do_atendimento(p_agendamento uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_doc   record;
  v_total int := 0;
begin
  for v_doc in
    insert into public.issued_documents (
      tenant_id, branch_id, client_id, template_id, template_version_id,
      appointment_id, procedure_id, kind, source, title, moment, enforcement)
    select b.tenant_id, a.branch_id, a.client_id, m.template_id, m.version_id,
           a.id, m.procedure_id, m.kind, m.source, m.title, 'AGENDAMENTO', m.enforcement
      from public.appointments a
      join public.branches b on b.id = a.branch_id
      cross join lateral private.modelos_do_atendimento(a.id) m
     where a.id = p_agendamento
       and a.client_id is not null
       and a.status not in ('CANCELLED', 'NO_SHOW')
       -- Termos e contratos são do PLANO da rede (lib/planos/recursos.ts).
       and private.rede_tem_recurso(b.tenant_id, 'documentos')
    on conflict (appointment_id, template_id)
      where appointment_id is not null and status not in ('CANCELADO', 'SUBSTITUIDO')
      do nothing
    returning id, tenant_id, branch_id, client_id, appointment_id, title, kind, enforcement
  loop
    v_total := v_total + 1;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'EMITIDO', jsonb_build_object('agendamentoId', v_doc.appointment_id));

    insert into public.domain_events
      (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave)
    values (
      v_doc.tenant_id, v_doc.branch_id, 'termo.emitido', 'termo', v_doc.id,
      jsonb_build_object(
        'clienteId', v_doc.client_id,
        'clienteNome', (select c.name from public.clients c where c.id = v_doc.client_id),
        'agendamentoId', v_doc.appointment_id,
        'referencia', v_doc.title,
        'tipo', v_doc.kind,
        'exigencia', v_doc.enforcement),
      'sistema', 'banco', 'termo.emitido:' || v_doc.id)
    on conflict (tenant_id, chave) where chave is not null do nothing;
  end loop;
  return v_total;
end $function$;

revoke execute on function public.documentos_emitir_do_atendimento(uuid) from public, anon, authenticated;
grant execute on function public.documentos_emitir_do_atendimento(uuid) to service_role;

create or replace function private.documentos_no_agendamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.treatment_plan_id is not null then return null; end if;

  -- DC4: tudo nasce ao agendar.
  if tg_op = 'INSERT' then
    perform public.documentos_emitir_do_atendimento(new.id);
    return null;
  end if;

  if new.status in ('CANCELLED', 'NO_SHOW') and old.status is distinct from new.status then
    perform private.documentos_cancelar_do_atendimento(new.id,
      case new.status when 'CANCELLED' then 'Agendamento cancelado' else 'Cliente não compareceu' end, null);
    return null;
  end if;

  -- Reaberto (a falta desfeita): volta a pedir os documentos — a emissão não
  -- repete o que está aberto ou assinado.
  if old.status in ('CANCELLED', 'NO_SHOW') and new.status not in ('CANCELLED', 'NO_SHOW') then
    perform public.documentos_emitir_do_atendimento(new.id);
  end if;

  if new.procedure_id is distinct from old.procedure_id then
    perform private.documentos_cancelar_do_atendimento(new.id, 'Procedimento trocado', new.procedure_id);
    perform public.documentos_emitir_do_atendimento(new.id);
  end if;
  return null;
end $function$;

-- A versão de antes, com o "momento", sai.
drop function public.documentos_emitir_do_atendimento(uuid, text[]);
drop function private.modelos_do_atendimento(uuid, text[]);

-- PC2: o agendamento que vira SESSÃO DE PACOTE não pede documento — ele nasce
-- avulso (o INSERT emite) e a sessão se liga logo depois (`ligarCredito`, o
-- "Usar o pacote" da janela, o "Abater do pacote"). Os abertos saem; o
-- assinado fica (é um fato).
create or replace function private.documentos_da_sessao_de_pacote()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.appointment_id is not null
     and (tg_op = 'INSERT' or old.appointment_id is distinct from new.appointment_id) then
    perform private.documentos_cancelar_do_atendimento(new.appointment_id,
      'Sessão de pacote: os documentos são os do pacote', null);
  end if;
  return null;
end $function$;

create trigger trg_documentos_da_sessao_de_pacote
  after insert or update of appointment_id on public.package_sessions
  for each row execute function private.documentos_da_sessao_de_pacote();

-- ─── DC1: salvar o modelo (sem "momento"; o contrato de pacote nasce inativo
-- quando a rede já tem um ativo, como o de plano) ─────────────────────────────

-- `p_momento` fica na assinatura e é IGNORADO (DC4): os chamadores de antes
-- seguem funcionando.
create or replace function public.documento_modelo_salvar(p_tenant uuid, p_modelo uuid, p_nome text, p_tipo text, p_origem text, p_momento text, p_exigencia text, p_texto text, p_arquivo_path text, p_arquivo_sha256 text, p_arquivo_nome text, p_arquivo_tamanho integer, p_arquivo_paginas integer, p_variaveis text[], p_usa_pagamento boolean, p_ator uuid, p_documento jsonb DEFAULT NULL::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_modelo  public.document_templates%rowtype;
  v_atual   public.document_template_versions%rowtype;
  v_id      uuid;
  v_versao  int;
  v_mudou   boolean;
  v_ativo   boolean;
  v_markup  text  := case when p_origem = 'EDITOR' and p_documento is null then p_texto end;
  v_doc     jsonb := case when p_origem = 'EDITOR' then p_documento end;
begin
  if p_modelo is null then
    -- Um contrato de plano (e um de pacote) ativo por rede: o segundo nasce
    -- inativo, e a troca é documento_contrato_de_plano_ativar.
    v_ativo := not (p_tipo in ('CONTRATO_PLANO', 'CONTRATO_PACOTE') and exists (
      select 1 from public.document_templates t
       where t.tenant_id = p_tenant and t.kind = p_tipo and t.is_active));

    insert into public.document_templates (tenant_id, name, kind, source, enforcement, created_by, is_active)
    values (p_tenant, trim(p_nome), p_tipo, p_origem, p_exigencia, p_ator, v_ativo)
    returning id into v_id;

    insert into public.document_template_versions (
      tenant_id, template_id, version, source, body_markup, body_doc,
      file_path, file_sha256, file_name, file_size, file_pages,
      variables, uses_payment, created_by)
    values (p_tenant, v_id, 1, p_origem, v_markup, v_doc,
            p_arquivo_path, p_arquivo_sha256, p_arquivo_nome, p_arquivo_tamanho, p_arquivo_paginas,
            coalesce(p_variaveis, '{}'), coalesce(p_usa_pagamento, false), p_ator);

    return jsonb_build_object('id', v_id, 'versao', 1, 'novaVersao', true, 'ativo', v_ativo);
  end if;

  select * into v_modelo from public.document_templates t
   where t.id = p_modelo and t.tenant_id = p_tenant
   for update;
  if not found then
    raise exception 'Modelo não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_modelo.kind <> p_tipo or v_modelo.source <> p_origem then
    raise exception 'O tipo e a origem de um modelo não mudam depois de criado.' using errcode = 'P0001';
  end if;

  select * into v_atual from public.document_template_versions v
   where v.template_id = p_modelo and v.version = v_modelo.current_version;

  v_mudou := case
    when p_origem = 'EDITOR' and v_doc is not null then v_doc is distinct from v_atual.body_doc
    when p_origem = 'EDITOR' then v_markup is not null and v_markup is distinct from v_atual.body_markup
    else p_arquivo_sha256 is not null and p_arquivo_sha256 is distinct from v_atual.file_sha256
  end;

  v_versao := v_modelo.current_version;
  if v_mudou then
    v_versao := v_versao + 1;
    insert into public.document_template_versions (
      tenant_id, template_id, version, source, body_markup, body_doc,
      file_path, file_sha256, file_name, file_size, file_pages,
      variables, uses_payment, created_by)
    values (p_tenant, p_modelo, v_versao, p_origem, v_markup, v_doc,
            p_arquivo_path, p_arquivo_sha256, p_arquivo_nome, p_arquivo_tamanho, p_arquivo_paginas,
            coalesce(p_variaveis, '{}'), coalesce(p_usa_pagamento, false), p_ator);
  end if;

  update public.document_templates t
     set name            = trim(p_nome),
         enforcement     = p_exigencia,
         current_version = v_versao,
         updated_at      = now()
   where t.id = p_modelo;

  return jsonb_build_object('id', p_modelo, 'versao', v_versao, 'novaVersao', v_mudou, 'ativo', v_modelo.is_active);
end $function$;

-- "Tornar ativo" vale para os dois contratos da rede (o de plano e o de
-- pacote): o atual DO MESMO TIPO sai, o escolhido entra, numa transação.
create or replace function public.documento_contrato_de_plano_ativar(p_tenant uuid, p_modelo uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_modelo   public.document_templates%rowtype;
  v_anterior uuid;
begin
  select * into v_modelo from public.document_templates t
   where t.id = p_modelo and t.tenant_id = p_tenant
   for update;
  if not found or v_modelo.kind not in ('CONTRATO_PLANO', 'CONTRATO_PACOTE') then
    raise exception 'Contrato não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Desliga o atual ANTES de ligar o escolhido: o índice único é imediato.
  update public.document_templates t
     set is_active = false, updated_at = now()
   where t.tenant_id = p_tenant and t.kind = v_modelo.kind and t.is_active and t.id <> p_modelo
  returning t.id into v_anterior;

  update public.document_templates t
     set is_active = true, updated_at = now()
   where t.id = p_modelo and not t.is_active;

  return jsonb_build_object('id', p_modelo, 'anterior', v_anterior);
end $function$;

-- ─── DC2: o contrato de pacote padrão ────────────────────────────────────────

create or replace function public.documentos_modelos_padrao(p_tenant uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_r jsonb;
begin
  if not exists (select 1 from public.document_templates t
                  where t.tenant_id = p_tenant and (t.system_key = 'CONTRATO_PLANO_PADRAO'
                        or (t.kind = 'CONTRATO_PLANO' and t.is_active))) then
    v_r := public.documento_modelo_salvar(
      p_tenant, null, 'Contrato de prestação de serviços', 'CONTRATO_PLANO', 'EDITOR', null, 'BLOQUEIA',
      E'# Contrato de prestação de serviços estéticos\n\n'
      || E'**Contratante:** {{cliente.nome}}\n'
      || E'**Contratada:** {{unidade.nome}} — {{rede.nome}}\n'
      || E'**Data:** {{data.hoje}}\n\n'
      || E'## Serviços contratados\n'
      || E'{{procedimentos.lista}}\n\n'
      || E'**Valor total:** {{plano.total}}\n'
      || E'**Forma de pagamento:** {{pagamento.forma}}\n\n'
      || E'A contratada se compromete a executar os procedimentos listados com profissionalismo, higiene e os materiais adequados.\n\n'
      || E'O contratante declara ter sido informado sobre os procedimentos, seus benefícios esperados e possíveis contraindicações.\n\n'
      || E'Li, entendi e concordo com os termos deste contrato.\n\n'
      || E'[[assinatura]]',
      null, null, null, null, null,
      array['cliente.nome', 'unidade.nome', 'rede.nome', 'data.hoje', 'procedimentos.lista', 'plano.total', 'pagamento.forma'],
      true, null);
    update public.document_templates t set system_key = 'CONTRATO_PLANO_PADRAO' where t.id = (v_r->>'id')::uuid;
  end if;

  -- DC2: o contrato de pacote padrão, o equivalente do de plano (PC9a).
  if not exists (select 1 from public.document_templates t
                  where t.tenant_id = p_tenant and (t.system_key = 'CONTRATO_PACOTE_PADRAO'
                        or (t.kind = 'CONTRATO_PACOTE' and t.is_active))) then
    v_r := public.documento_modelo_salvar(
      p_tenant, null, 'Contrato de pacote', 'CONTRATO_PACOTE', 'EDITOR', null, 'BLOQUEIA',
      E'# Contrato de pacote de serviços estéticos\n\n'
      || E'**Contratante:** {{cliente.nome}}\n'
      || E'**Contratada:** {{unidade.nome}} — {{rede.nome}}\n'
      || E'**Data:** {{data.hoje}}\n\n'
      || E'## Pacote contratado: {{pacote.nome}}\n'
      || E'{{pacote.procedimentos}}\n\n'
      || E'**Sessões:** {{pacote.sessoes}}\n'
      || E'**Validade:** {{pacote.validade}}\n'
      || E'**Valor total:** {{pacote.total}}\n'
      || E'**Forma de pagamento:** {{pagamento.forma}}\n\n'
      || E'As sessões do pacote são agendadas conforme a agenda da contratada e valem só para os procedimentos listados.\n\n'
      || E'A contratada se compromete a executar os procedimentos listados com profissionalismo, higiene e os materiais adequados.\n\n'
      || E'O contratante declara ter sido informado sobre os procedimentos, seus benefícios esperados e possíveis contraindicações.\n\n'
      || E'Li, entendi e concordo com os termos deste contrato.\n\n'
      || E'[[assinatura]]',
      null, null, null, null, null,
      array['cliente.nome', 'unidade.nome', 'rede.nome', 'data.hoje', 'pacote.nome', 'pacote.procedimentos',
            'pacote.sessoes', 'pacote.validade', 'pacote.total', 'pagamento.forma'],
      true, null);
    update public.document_templates t set system_key = 'CONTRATO_PACOTE_PADRAO' where t.id = (v_r->>'id')::uuid;
  end if;
end $function$;

-- As redes de antes (as que ganharam o contrato de plano padrão ao nascer)
-- ganham o de pacote. O de plano não muda: já têm o system_key.
select public.documentos_modelos_padrao(t.tenant_id)
  from public.document_templates t
 where t.system_key = 'CONTRATO_PLANO_PADRAO';

notify pgrst, 'reload schema';
