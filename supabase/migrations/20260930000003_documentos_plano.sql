-- Termos e contratos — fase 3: o fechamento do PLANO.
--
-- No plano, o cliente assina UM termo por procedimento distinto (dois
-- procedimentos com o mesmo termo = um só) e UM contrato de plano da rede, que
-- lista procedimentos, sessões, valor e a forma de pagamento (decisões do
-- Heitor, 2026-09-29). Os contratos ligados aos procedimentos não entram — são
-- do atendimento avulso.
--
-- Os documentos do plano nascem no checkout, DEPOIS de escolhida a forma de
-- pagamento (o contrato a cita), por `documentos_emitir_do_plano`. A trava de
-- "não fecha sem assinar" mora no app (antes do dinheiro) E num gatilho no
-- plano, como segunda linha.
--
-- Os dois termos fixos de `consent_terms` viram documentos emitidos (LEGADO):
-- o histórico do cliente passa a ler um lugar só.

-- ─── Gravar o texto montado, agora com o pagamento ───────────────────────────
-- O contrato de plano cita a forma de pagamento, e o retrato dela fica junto
-- do texto: é contra ele que o checkout confere se o cliente assinou O MESMO
-- pagamento que está sendo lançado.
create or replace function public.documento_registrar_texto(
  p_doc uuid, p_tenant uuid, p_status text, p_conteudo text, p_texto text,
  p_sha256 text, p_faltando text[], p_codigo text, p_pagamento jsonb
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_antes  text;
  v_codigo text;
begin
  if p_status not in ('PENDENTE', 'INCOMPLETO') then
    raise exception 'Status de render inválido.' using errcode = 'P0001';
  end if;

  select d.status into v_antes from public.issued_documents d
   where d.id = p_doc and d.tenant_id = p_tenant for update;
  if not found then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_antes not in ('A_GERAR', 'INCOMPLETO', 'PENDENTE') then
    raise exception 'Este documento não pode mais ser alterado.' using errcode = 'P0001';
  end if;

  update public.issued_documents d
     set status            = p_status,
         content           = p_conteudo,
         content_text      = p_texto,
         content_sha256    = p_sha256,
         missing_fields    = coalesce(p_faltando, '{}'),
         payment_snapshot  = coalesce(p_pagamento, d.payment_snapshot),
         verification_code = coalesce(d.verification_code, p_codigo),
         rendered_at       = now()
   where d.id = p_doc
  returning d.verification_code into v_codigo;

  if v_antes is distinct from p_status then
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (p_doc, p_tenant, case p_status when 'INCOMPLETO' then 'INCOMPLETO' else 'GERADO' end,
            case when p_status = 'INCOMPLETO' then jsonb_build_object('faltando', p_faltando) end);
  end if;
  return v_codigo;
end $$;

-- A de antes passa a ser um atalho para a de agora (sem pagamento).
create or replace function public.documento_registrar_render(
  p_doc uuid, p_tenant uuid, p_status text, p_conteudo text, p_texto text,
  p_sha256 text, p_faltando text[], p_codigo text
)
returns text
language sql security definer set search_path = ''
as $$
  select public.documento_registrar_texto(p_doc, p_tenant, p_status, p_conteudo, p_texto, p_sha256, p_faltando, p_codigo, null)
$$;

-- ─── Quais modelos valem para um plano ───────────────────────────────────────
-- A ÚNICA cópia da regra do plano: um termo por modelo distinto entre os
-- procedimentos das sessões (o procedimento de referência é o primeiro pelo
-- nome), mais o contrato de plano ativo da rede.
create or replace function private.modelos_do_plano(p_plano uuid)
returns table (template_id uuid, version_id uuid, kind text, source text, title text,
               enforcement text, procedure_id uuid)
language sql stable security definer set search_path = '' as $$
  with plano as (
    select tp.id, b.tenant_id
      from public.treatment_plans tp
      join public.branches b on b.id = tp.branch_id
     where tp.id = p_plano
  ), termos as (
    select distinct on (t.id) t.id, v.id as versao, t.kind, t.source, t.name, t.enforcement, p.id as proc
      from plano
      join public.treatment_plan_sessions s on s.plan_id = plano.id
      join public.treatment_plan_session_procedures sp on sp.session_id = s.id
      join public.procedures p on p.id = sp.procedure_id
      join public.document_templates t on t.id = p.consent_template_id and t.tenant_id = plano.tenant_id
      join public.document_template_versions v on v.template_id = t.id and v.version = t.current_version
     where t.is_active
     order by t.id, p.name
  )
  select termos.id, termos.versao, termos.kind, termos.source, termos.name, termos.enforcement, termos.proc from termos
  union all
  select t.id, v.id, t.kind, t.source, t.name, t.enforcement, null::uuid
    from plano
    join public.document_templates t on t.tenant_id = plano.tenant_id and t.kind = 'CONTRATO_PLANO' and t.is_active
    join public.document_template_versions v on v.template_id = t.id and v.version = t.current_version
$$;

-- ─── Emitir os documentos de um plano ────────────────────────────────────────
-- Idempotente. O que deixou de valer (o plano foi editado, um procedimento
-- saiu) e ainda está aberto é cancelado.
create or replace function public.documentos_emitir_do_plano(p_plano uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc   record;
  v_total int := 0;
begin
  for v_doc in
    update public.issued_documents d
       set status = 'CANCELADO', closed_reason = 'O plano mudou', closed_at = now()
     where d.treatment_plan_id = p_plano and d.appointment_id is null
       and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
       and d.template_id not in (select m.template_id from private.modelos_do_plano(p_plano) m)
    returning d.id, d.tenant_id
  loop
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'CANCELADO', jsonb_build_object('motivo', 'O plano mudou'));
  end loop;

  for v_doc in
    insert into public.issued_documents (
      tenant_id, branch_id, client_id, template_id, template_version_id,
      treatment_plan_id, procedure_id, kind, source, title, moment, enforcement)
    select b.tenant_id, tp.branch_id, tp.client_id, m.template_id, m.version_id,
           tp.id, m.procedure_id, m.kind, m.source, m.title, 'FECHAMENTO_PLANO', m.enforcement
      from public.treatment_plans tp
      join public.branches b on b.id = tp.branch_id
      cross join lateral private.modelos_do_plano(tp.id) m
     where tp.id = p_plano
    on conflict (treatment_plan_id, template_id)
      where treatment_plan_id is not null and appointment_id is null and status not in ('CANCELADO', 'SUBSTITUIDO')
      do nothing
    returning id, tenant_id, branch_id, client_id, treatment_plan_id, title, kind, enforcement
  loop
    v_total := v_total + 1;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'EMITIDO', jsonb_build_object('planoId', v_doc.treatment_plan_id));

    insert into public.domain_events
      (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave)
    values (
      v_doc.tenant_id, v_doc.branch_id, 'termo.emitido', 'termo', v_doc.id,
      jsonb_build_object(
        'clienteId', v_doc.client_id,
        'clienteNome', (select c.name from public.clients c where c.id = v_doc.client_id),
        'agendamentoId', null,
        'referencia', v_doc.title,
        'tipo', v_doc.kind,
        'exigencia', v_doc.enforcement),
      'sistema', 'banco', 'termo.emitido:' || v_doc.id)
    on conflict (tenant_id, chave) where chave is not null do nothing;
  end loop;
  return v_total;
end $$;

create or replace function public.documentos_pendentes_do_plano(p_plano uuid)
returns table (id uuid, title text, kind text, enforcement text, status text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.title, d.kind, d.enforcement, d.status
    from public.issued_documents d
   where d.treatment_plan_id = p_plano and d.appointment_id is null
     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
   order by d.kind, d.title
$$;

-- ─── Substituir um documento já assinado ─────────────────────────────────────
-- O cliente assinou o contrato com um pagamento e a recepção voltou e mudou o
-- pagamento: o contrato assinado não vale para o pagamento novo. Ele fica
-- SUBSTITUIDO (com a assinatura, como prova do que houve) e nasce outro.
create or replace function public.documento_substituir(p_doc uuid, p_tenant uuid, p_ator uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc  public.issued_documents%rowtype;
  v_novo uuid;
begin
  select * into v_doc from public.issued_documents d
   where d.id = p_doc and d.tenant_id = p_tenant for update;
  if not found then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_doc.status not in ('ASSINADO', 'PENDENTE', 'INCOMPLETO', 'A_GERAR') then
    raise exception 'Este documento não pode ser substituído.' using errcode = 'P0001';
  end if;

  update public.issued_documents d
     set status = 'SUBSTITUIDO', closed_by = p_ator, closed_at = now(), closed_reason = 'Substituído por outro'
   where d.id = p_doc;

  insert into public.issued_documents (
    tenant_id, branch_id, client_id, template_id, template_version_id, appointment_id,
    treatment_plan_id, procedure_id, kind, source, title, moment, enforcement)
  values (v_doc.tenant_id, v_doc.branch_id, v_doc.client_id, v_doc.template_id, v_doc.template_version_id,
          v_doc.appointment_id, v_doc.treatment_plan_id, v_doc.procedure_id, v_doc.kind, v_doc.source,
          v_doc.title, v_doc.moment, v_doc.enforcement)
  returning id into v_novo;

  update public.issued_documents d set replaced_by = v_novo where d.id = p_doc;

  insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, details)
  values (p_doc, p_tenant, 'SUBSTITUIDO', p_ator, jsonb_build_object('novo', v_novo)),
         (v_novo, p_tenant, 'EMITIDO', p_ator, jsonb_build_object('substitui', p_doc));
  return v_novo;
end $$;

-- ─── Trava no plano (segunda linha; a primeira é o app, antes do dinheiro) ──
create or replace function private.documentos_bloqueiam_plano()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_faltam text;
begin
  if new.status <> 'ACCEPTED' or old.status = 'ACCEPTED' then return new; end if;

  perform public.documentos_emitir_do_plano(new.id);
  select string_agg(p.title, ', ' order by p.title) into v_faltam
    from public.documentos_pendentes_do_plano(new.id) p
   where p.enforcement = 'BLOQUEIA';
  if v_faltam is not null then
    raise exception 'Falta assinar: %. Colha a assinatura antes de fechar o plano.', v_faltam
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger trg_documentos_bloqueiam_plano
  before update of status on public.treatment_plans
  for each row execute function private.documentos_bloqueiam_plano();

-- ─── O contrato de plano padrão ──────────────────────────────────────────────
-- O mesmo texto do contrato fixo de antes, agora como modelo que a rede pode
-- editar — e com a forma de pagamento, que o de antes não tinha. Sem CPF de
-- propósito: exigir o que o contrato de antes não exigia travaria o checkout de
-- quem foi cadastrado pelo cadastro rápido. A rede acrescenta se quiser.
create or replace function public.documentos_modelos_padrao(p_tenant uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_r jsonb;
begin
  if exists (select 1 from public.document_templates t
              where t.tenant_id = p_tenant and (t.system_key = 'CONTRATO_PLANO_PADRAO'
                    or (t.kind = 'CONTRATO_PLANO' and t.is_active))) then
    return;
  end if;
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
end $$;

-- Toda rede de verdade ganha o seu (as de teste `[e2e]` montam o que precisam).
do $$
declare
  v_t uuid;
begin
  for v_t in select t.id from public.tenants t where t.name not like '[e2e]%' loop
    perform public.documentos_modelos_padrao(v_t);
  end loop;
end $$;

-- ─── O legado: os termos fixos viram documentos emitidos ─────────────────────
-- Só os ASSINADOS (os pendentes eram de checkouts abandonados). O conteúdo de
-- antes vai como texto; a assinatura desenhada vai como evidência LEGADO.
insert into public.issued_documents (
  tenant_id, branch_id, client_id, treatment_plan_id, kind, source, title, moment, enforcement,
  status, content_text, content_sha256, signed_at, legacy_consent_term_id, created_at)
select c.tenant_id, tp.branch_id, mr.client_id, ct.treatment_plan_id,
       case when ct.title ilike 'contrato%' then 'CONTRATO_PLANO' else 'TERMO' end,
       'EDITOR', ct.title, 'LEGADO', 'BLOQUEIA', 'ASSINADO',
       ct.content, encode(sha256(convert_to(coalesce(ct.content, ''), 'UTF8')), 'hex'),
       coalesce(ct.signed_at, ct.created_at), ct.id, ct.created_at
  from public.consent_terms ct
  join public.medical_records mr on mr.id = ct.medical_record_id
  join public.clients c on c.id = mr.client_id
  left join public.treatment_plans tp on tp.id = ct.treatment_plan_id
 where ct.status = 'SIGNED'
on conflict (legacy_consent_term_id) do nothing;

insert into public.document_signatures (
  issued_document_id, tenant_id, channel, identity_method, signer_name, signature_png,
  content_sha256, accepted_text, signed_at)
select d.id, d.tenant_id,
       case ct.signed_via when 'paper' then 'PAPEL' else 'CLINICA' end,
       'LEGADO', c.name, ct.signature_data, d.content_sha256,
       'Assinado no checkout de plano (antes dos modelos de documento)', d.signed_at
  from public.issued_documents d
  join public.consent_terms ct on ct.id = d.legacy_consent_term_id
  join public.clients c on c.id = d.client_id
 where not exists (select 1 from public.document_signatures s where s.issued_document_id = d.id);

-- ─── Só o servidor chama ─────────────────────────────────────────────────────
revoke execute on function public.documento_registrar_texto(uuid, uuid, text, text, text, text, text[], text, jsonb) from public, anon, authenticated;
revoke execute on function public.documentos_emitir_do_plano(uuid)    from public, anon, authenticated;
revoke execute on function public.documentos_pendentes_do_plano(uuid) from public, anon, authenticated;
revoke execute on function public.documento_substituir(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.documentos_modelos_padrao(uuid)     from public, anon, authenticated;
grant execute on function public.documento_registrar_texto(uuid, uuid, text, text, text, text, text[], text, jsonb) to service_role;
grant execute on function public.documentos_emitir_do_plano(uuid)    to service_role;
grant execute on function public.documentos_pendentes_do_plano(uuid) to service_role;
grant execute on function public.documento_substituir(uuid, uuid, uuid) to service_role;
grant execute on function public.documentos_modelos_padrao(uuid)     to service_role;

notify pgrst, 'reload schema';
