-- Correções da auditoria das regras (2026-11-18), a parte dos documentos.
--
-- 1. O pacote assina ANTES de pagar, como o plano. O Heitor (PC2, 13/11): "ele
--    assina pelo pacote. o ideal era funcionar como no plano de tratamento"; e
--    do plano: "primeiro colhe assinatura, depois paga". Até aqui a venda do
--    pacote gravava o dinheiro e só então emitia o contrato ("do pacote nada
--    foi dito" — a premissa errada).
--    O contrato de pacote nasce na VENDA, antes do dinheiro, com a forma
--    escolhida: ainda não há pacote vendido, então ele guarda o pacote do
--    catálogo (`issued_documents.service_package_id`, sem `client_package_id`).
--    A venda (o app confere antes: assinado ou dispensado) o ADOTA na mesma
--    transação que grava o pacote vendido — `documentos_emitir_do_pacote`, que
--    o gatilho da venda chama — e não emite um segundo contrato. Só o contrato
--    trava o dinheiro; os termos e os outros documentos nascem na venda, como
--    antes (como no plano: PT1c).
--
-- 2. Os documentos do plano nascem na CRIAÇÃO. O DC4 ("concordo", 13/11): "o do
--    pacote e o do plano, na venda/na criação"; e "os documentos nascem na
--    criação e se assinam de uma vez". Nasciam no aceite. O app passa a emitir
--    a cada "Salvar plano" (`documentos_emitir_do_plano(plano, false)`, que já
--    cancela o que saiu e emite o que entrou); aqui, a função não emite para
--    plano sem cliente (`client_id` é obrigatório no documento) nem para o
--    fechado, cancelado ou recusado. E o plano cancelado ou recusado cancela os
--    documentos abertos dele (como o pacote cancelado — decisão do Claude pelo
--    princípio 3: o que a cliente não vai fazer não fica "para assinar").

-- ─── 1. O contrato da venda do pacote, antes do pacote vendido ─────────────
alter table public.issued_documents
  add column if not exists service_package_id uuid references public.service_packages(id);

create index if not exists issued_documents_service_package_id_idx
  on public.issued_documents (service_package_id);

-- Um contrato vivo por cliente e pacote do catálogo, enquanto a venda não
-- acontece: assinado com outro pagamento, ele é SUBSTITUÍDO (com a pergunta).
create unique index if not exists uniq_contrato_da_venda_do_pacote
  on public.issued_documents (client_id, service_package_id)
  where service_package_id is not null and client_package_id is null
    and status not in ('CANCELADO', 'SUBSTITUIDO');

-- O contrato de pacote da venda: o vivo (reaproveitado), ou um novo. Devolve o
-- id, ou nulo sem os Documentos no plano da rede ou sem contrato de pacote
-- ativo (a venda segue sem contrato). `p_substituir`: o assinado (com outro
-- pagamento — o app conferiu e perguntou) fica SUBSTITUIDO e nasce outro.
-- O aberto de outra versão do modelo ou de outra unidade é cancelado e nasce
-- de novo: o que se assina é o contrato ativo de agora, da unidade da venda.
create or replace function public.documento_contrato_da_venda_do_pacote(
  p_tenant uuid, p_cliente uuid, p_pacote uuid, p_unidade uuid, p_ator uuid, p_substituir boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t   record;
  v_doc public.issued_documents%rowtype;
  v_id  uuid;
begin
  if not private.rede_tem_recurso(p_tenant, 'documentos') then return null; end if;
  if not exists (select 1 from public.clients c where c.id = p_cliente and c.tenant_id = p_tenant) then
    raise exception 'Cliente não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.service_packages sp where sp.id = p_pacote and sp.tenant_id = p_tenant) then
    raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_unidade and b.tenant_id = p_tenant) then
    raise exception 'Unidade não encontrada.' using errcode = 'no_data_found';
  end if;

  select t.id, v.id as versao, t.source, t.name, t.enforcement into v_t
    from public.document_templates t
    join public.document_template_versions v on v.template_id = t.id and v.version = t.current_version
   where t.tenant_id = p_tenant and t.kind = 'CONTRATO_PACOTE' and t.is_active
   order by t.name limit 1;
  if not found then return null; end if;

  select * into v_doc from public.issued_documents d
   where d.tenant_id = p_tenant and d.client_id = p_cliente and d.service_package_id = p_pacote
     and d.client_package_id is null and d.status not in ('CANCELADO', 'SUBSTITUIDO')
   for update;

  if found then
    if v_doc.status = 'DISPENSADO' then
      return v_doc.id;
    elsif v_doc.status = 'ASSINADO' then
      if not p_substituir then return v_doc.id; end if;
      update public.issued_documents d
         set status = 'SUBSTITUIDO', closed_by = p_ator, closed_at = now(), closed_reason = 'Substituído por outro'
       where d.id = v_doc.id;
      insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, details)
      values (v_doc.id, p_tenant, 'SUBSTITUIDO', p_ator, jsonb_build_object('motivo', 'Outro pagamento na venda do pacote'));
    elsif v_doc.template_version_id = v_t.versao and v_doc.branch_id is not distinct from p_unidade then
      return v_doc.id;
    else
      update public.issued_documents d
         set status = 'CANCELADO', closed_reason = 'O contrato mudou', closed_at = now()
       where d.id = v_doc.id;
      insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
      values (v_doc.id, p_tenant, 'CANCELADO', jsonb_build_object('motivo', 'O contrato mudou'));
      update public.document_sign_links l set revoked_at = now()
       where l.issued_document_id = v_doc.id and l.used_at is null and l.revoked_at is null;
    end if;
  end if;

  insert into public.issued_documents (
    tenant_id, branch_id, client_id, template_id, template_version_id,
    service_package_id, kind, source, title, moment, enforcement)
  values (p_tenant, p_unidade, p_cliente, v_t.id, v_t.versao,
          p_pacote, 'CONTRATO_PACOTE', v_t.source, v_t.name, 'VENDA_PACOTE', v_t.enforcement)
  returning id into v_id;

  insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, details)
  values (v_id, p_tenant, 'EMITIDO', p_ator, jsonb_build_object('pacote', p_pacote, 'antesDaVenda', true));

  insert into public.domain_events
    (tenant_id, branch_id, nome, entidade, entidade_id, dados, ator_tipo, origem, chave)
  values (
    p_tenant, p_unidade, 'termo.emitido', 'termo', v_id,
    jsonb_build_object(
      'clienteId', p_cliente,
      'clienteNome', (select c.name from public.clients c where c.id = p_cliente),
      'agendamentoId', null,
      'referencia', v_t.name,
      'tipo', 'CONTRATO_PACOTE',
      'exigencia', v_t.enforcement),
    'sistema', 'banco', 'termo.emitido:' || v_id)
  on conflict (tenant_id, chave) where chave is not null do nothing;
  return v_id;
end $$;

revoke execute on function public.documento_contrato_da_venda_do_pacote(uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.documento_contrato_da_venda_do_pacote(uuid, uuid, uuid, uuid, uuid, boolean) to service_role;

-- A venda adota o contrato assinado (ou dispensado) antes dela: só o pacote
-- vendido NESTA transação (`purchased_at = now()`, o instante da venda), para
-- nunca prender a um pacote vendido antes o contrato de uma venda nova. Com o
-- contrato adotado, o de pacote não nasce de novo.
create or replace function public.documentos_emitir_do_pacote(p_pacote_vendido uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc   record;
  v_total int := 0;
begin
  update public.issued_documents d
     set client_package_id = cp.id
    from public.client_packages cp
   where cp.id = p_pacote_vendido
     and not cp.de_fora
     and cp.purchased_at = now()
     and not exists (select 1 from public.issued_documents x
                      where x.client_package_id = cp.id and x.kind = 'CONTRATO_PACOTE'
                        and x.status not in ('CANCELADO', 'SUBSTITUIDO'))
     and d.id = (select d2.id from public.issued_documents d2
                  where d2.client_id = cp.client_id and d2.service_package_id = cp.package_id
                    and d2.client_package_id is null and d2.status in ('ASSINADO', 'DISPENSADO')
                  order by coalesce(d2.signed_at, d2.closed_at, d2.created_at) desc
                  limit 1);

  for v_doc in
    insert into public.issued_documents (
      tenant_id, branch_id, client_id, template_id, template_version_id,
      client_package_id, procedure_id, kind, source, title, moment, enforcement)
    select b.tenant_id, cp.branch_id, cp.client_id, m.template_id, m.version_id,
           cp.id, m.procedure_id, m.kind, m.source, m.title, 'VENDA_PACOTE', m.enforcement
      from public.client_packages cp
      join public.branches b on b.id = cp.branch_id
      cross join lateral private.modelos_do_pacote(cp.id) m
     where cp.id = p_pacote_vendido
       and not cp.de_fora
       and cp.cancelado_em is null
       and private.rede_tem_recurso(b.tenant_id, 'documentos')
       and not (m.kind = 'CONTRATO_PACOTE' and exists (
             select 1 from public.issued_documents x
              where x.client_package_id = cp.id and x.kind = 'CONTRATO_PACOTE'
                and x.status not in ('CANCELADO', 'SUBSTITUIDO')))
    on conflict (client_package_id, template_id)
      where client_package_id is not null and status not in ('CANCELADO', 'SUBSTITUIDO')
      do nothing
    returning id, tenant_id, branch_id, client_id, client_package_id, title, kind, enforcement
  loop
    v_total := v_total + 1;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'EMITIDO', jsonb_build_object('pacoteId', v_doc.client_package_id));

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

revoke execute on function public.documentos_emitir_do_pacote(uuid) from public, anon, authenticated;
grant execute on function public.documentos_emitir_do_pacote(uuid) to service_role;

-- ─── 2. Os documentos do plano nascem na criação ───────────────────────────
create or replace function public.documentos_emitir_do_plano(p_plano uuid, p_com_contrato boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc   record;
  v_total int := 0;
begin
  -- Só o plano com cliente e ainda aberto (rascunho, proposto ou aceito).
  if not exists (select 1 from public.treatment_plans tp
                  where tp.id = p_plano and tp.client_id is not null
                    and tp.status::text in ('DRAFT', 'PROPOSED', 'ACCEPTED')) then
    return 0;
  end if;

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
    update public.document_sign_links l set revoked_at = now()
     where l.issued_document_id = v_doc.id and l.used_at is null and l.revoked_at is null;
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
       and tp.client_id is not null
       and (p_com_contrato or m.kind <> 'CONTRATO_PLANO')
       and private.rede_tem_recurso(b.tenant_id, 'documentos')
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

-- O plano cancelado ou recusado cancela os documentos abertos dele e revoga os links.
create or replace function private.documentos_do_plano_cancelado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc    record;
  v_motivo text;
begin
  if new.status::text not in ('CANCELLED', 'REJECTED') or old.status::text is not distinct from new.status::text then
    return null;
  end if;
  v_motivo := case when new.status::text = 'REJECTED' then 'Plano recusado' else 'Plano cancelado' end;
  for v_doc in
    update public.issued_documents d
       set status = 'CANCELADO', closed_reason = v_motivo, closed_at = now()
     where d.treatment_plan_id = new.id and d.appointment_id is null
       and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
    returning d.id, d.tenant_id
  loop
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'CANCELADO', jsonb_build_object('motivo', v_motivo));
    update public.document_sign_links l set revoked_at = now()
     where l.issued_document_id = v_doc.id and l.used_at is null and l.revoked_at is null;
  end loop;
  return null;
end $$;

drop trigger if exists trg_documentos_do_plano_cancelado on public.treatment_plans;
create trigger trg_documentos_do_plano_cancelado after update of status on public.treatment_plans
  for each row execute function private.documentos_do_plano_cancelado();

notify pgrst, 'reload schema';
