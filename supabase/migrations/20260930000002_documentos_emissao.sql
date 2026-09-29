-- Termos e contratos — fase 2: o documento EMITIDO e a assinatura.
--
-- O documento nasce do procedimento do agendamento (fase 1 ligou até um termo
-- e um contrato a cada procedimento), num de dois momentos que o MODELO
-- escolhe: ao agendar ou no início do atendimento. Sempre de novo — cada
-- atendimento pede os seus (decisão do Heitor, 2026-09-29). Agendamento de
-- plano não emite nada aqui: o plano tem os documentos dele (fase 3).
--
-- A emissão é GATILHO, pelo argumento de sempre (§9.9): o agendamento nasce em
-- cinco INSERTs diferentes no código, e instrumentar um a um é garantir
-- esquecer o próximo. O gatilho só cria a linha em A_GERAR; o texto é montado
-- pelo app (lib/documentos/renderizar.ts), que sabe formatar CPF, data e
-- endereço — e grava por documento_registrar_render.
--
-- O BLOQUEIO também é gatilho: há duas portas para IN_PROGRESS no código
-- (startAppointment e updateAppointmentStatus), e a trava tem de valer nas
-- duas e na próxima.
--
-- Assinar passa por UMA função, documento_assinar, para os quatro canais
-- (clínica, papel agora; portal e link nas fases 5 e 6): trava o documento,
-- confere que o que foi ASSINADO é o que foi MOSTRADO (o hash), grava a
-- evidência e o status numa transação.

-- ─── Documento emitido ───────────────────────────────────────────────────────
create table public.issued_documents (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  branch_id           uuid references public.branches(id),
  client_id           uuid not null references public.clients(id),
  -- Nulos só no legado (os termos fixos de consent_terms, fase 3).
  template_id         uuid,
  template_version_id uuid references public.document_template_versions(id),
  -- Sem o agendamento o documento não tem por que existir; com ASSINATURA ele
  -- não sai (document_signatures trava a exclusão).
  appointment_id      uuid references public.appointments(id) on delete cascade,
  treatment_plan_id   uuid references public.treatment_plans(id) on delete cascade,
  procedure_id        uuid references public.procedures(id),
  -- Retrato do modelo no momento da emissão: mudar o modelo depois não muda
  -- o que este documento exige.
  kind                text not null check (kind in ('TERMO', 'CONTRATO', 'CONTRATO_PLANO')),
  source              text not null check (source in ('EDITOR', 'ARQUIVO')),
  title               text not null,
  moment              text not null check (moment in ('AGENDAMENTO', 'INICIO_ATENDIMENTO', 'FECHAMENTO_PLANO', 'LEGADO')),
  enforcement         text not null check (enforcement in ('BLOQUEIA', 'AVISA')),
  status              text not null default 'A_GERAR'
                      check (status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE', 'ASSINADO', 'DISPENSADO', 'CANCELADO', 'SUBSTITUIDO')),
  -- A forma canônica (JSON da árvore resolvida) GUARDADA COMO TEXTO: são estes
  -- bytes que o hash prova. jsonb reordenaria as chaves e o hash não bateria.
  content             text,
  content_text        text,
  content_sha256      text,
  missing_fields      text[] not null default '{}',
  payment_snapshot    jsonb,
  -- Nasce no primeiro render e não muda mais: já sai no papel impresso.
  verification_code   text unique,
  rendered_at         timestamptz,
  signed_at           timestamptz,
  signed_pdf_path     text,
  signed_pdf_sha256   text,
  pdf_attempts        int not null default 0,
  replaced_by         uuid references public.issued_documents(id),
  -- Dispensa e cancelamento: quem, quando e por quê.
  closed_reason       text,
  closed_by           uuid references public.users(id),
  closed_at           timestamptz,
  legacy_consent_term_id uuid unique,
  created_at          timestamptz not null default now(),
  constraint issued_documents_modelo_fkey
    foreign key (template_id, tenant_id) references public.document_templates(id, tenant_id),
  constraint issued_documents_origem check (
    legacy_consent_term_id is not null or (template_id is not null and template_version_id is not null)
  )
);

-- Um documento por modelo e por agendamento (ou plano) enquanto ele vale — é
-- o índice que impede o gatilho, rodando duas vezes, de pedir duas assinaturas.
create unique index uniq_documento_do_agendamento on public.issued_documents (appointment_id, template_id)
  where appointment_id is not null and status not in ('CANCELADO', 'SUBSTITUIDO');
create unique index uniq_documento_do_plano on public.issued_documents (treatment_plan_id, template_id)
  where treatment_plan_id is not null and appointment_id is null and status not in ('CANCELADO', 'SUBSTITUIDO');
create index idx_issued_documents_cliente on public.issued_documents (client_id, status);
create index idx_issued_documents_rede on public.issued_documents (tenant_id, status, created_at);

-- ─── Assinatura (a evidência) ────────────────────────────────────────────────
create table public.document_signatures (
  id                 uuid primary key default gen_random_uuid(),
  -- SEM cascade: documento assinado não se apaga, nem levado pelo agendamento.
  issued_document_id uuid not null unique references public.issued_documents(id),
  tenant_id          uuid not null references public.tenants(id),
  channel            text not null check (channel in ('CLINICA', 'PORTAL', 'LINK', 'PAPEL')),
  identity_method    text not null check (identity_method in ('PRESENCIAL', 'SESSAO_PORTAL', 'CPF', 'NASCIMENTO', 'LEGADO')),
  signer_name        text not null,
  signer_document    text,
  -- A imagem fica NA LINHA, gravada na mesma transação das evidências: sem
  -- arquivo solto no Storage que pudesse faltar depois.
  signature_png      text check (signature_png is null or (signature_png like 'data:image/png;base64,%' and length(signature_png) <= 400000)),
  signature_sha256   text,
  ip                 inet,
  user_agent         text,
  -- O hash do que foi MOSTRADO a quem assinou — igual ao do documento, ou a
  -- assinatura não teria sido aceita.
  content_sha256     text not null,
  conducted_by       uuid references public.users(id),
  link_id            uuid,
  scan_path          text,
  scan_sha256        text,
  accepted_text      text,
  signed_at          timestamptz not null default now(),
  constraint document_signatures_imagem_do_canal check (
    channel = 'PAPEL' or identity_method = 'LEGADO' or signature_png is not null
  )
);

create or replace function private.assinatura_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'A assinatura de um documento não se altera.' using errcode = 'P0001';
end $$;

create trigger trg_assinatura_imutavel
  before update on public.document_signatures
  for each row execute function private.assinatura_imutavel();

-- ─── Trilha do documento (só se acrescenta) ──────────────────────────────────
create table public.issued_document_events (
  id                 bigserial primary key,
  issued_document_id uuid not null references public.issued_documents(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id),
  kind               text not null,
  actor_user_id      uuid references public.users(id),
  actor_is_client    boolean not null default false,
  channel            text,
  ip                 inet,
  user_agent         text,
  details            jsonb,
  created_at         timestamptz not null default now()
);
create index idx_issued_document_events_doc on public.issued_document_events (issued_document_id, created_at);

-- ─── Quais modelos valem para um agendamento ─────────────────────────────────
-- A ÚNICA cópia da regra do atendimento avulso: o termo e o contrato do
-- procedimento, ativos, do momento pedido. Agendamento de plano não tem.
create or replace function private.modelos_do_atendimento(p_agendamento uuid, p_momentos text[])
returns table (template_id uuid, version_id uuid, kind text, source text, title text,
               moment text, enforcement text, procedure_id uuid)
language sql stable security definer set search_path = '' as $$
  select t.id, v.id, t.kind, t.source, t.name, t.moment, t.enforcement, a.procedure_id
    from public.appointments a
    join public.procedures p on p.id = a.procedure_id
    join public.document_templates t
      on t.tenant_id = p.tenant_id
     and t.id in (p.consent_template_id, p.contract_template_id)
    join public.document_template_versions v on v.template_id = t.id and v.version = t.current_version
   where a.id = p_agendamento
     and a.treatment_plan_id is null
     and t.is_active
     and t.moment = any (p_momentos)
$$;

-- ─── Emitir os documentos de um agendamento ──────────────────────────────────
create or replace function public.documentos_emitir_do_atendimento(p_agendamento uuid, p_momentos text[])
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc   record;
  v_total int := 0;
begin
  for v_doc in
    insert into public.issued_documents (
      tenant_id, branch_id, client_id, template_id, template_version_id,
      appointment_id, procedure_id, kind, source, title, moment, enforcement)
    select b.tenant_id, a.branch_id, a.client_id, m.template_id, m.version_id,
           a.id, m.procedure_id, m.kind, m.source, m.title, m.moment, m.enforcement
      from public.appointments a
      join public.branches b on b.id = a.branch_id
      cross join lateral private.modelos_do_atendimento(a.id, p_momentos) m
     where a.id = p_agendamento
       and a.client_id is not null
       and a.status not in ('CANCELLED', 'NO_SHOW')
    on conflict (appointment_id, template_id)
      where appointment_id is not null and status not in ('CANCELADO', 'SUBSTITUIDO')
      do nothing
    returning id, tenant_id, branch_id, client_id, appointment_id, title, kind, enforcement
  loop
    v_total := v_total + 1;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'EMITIDO', jsonb_build_object('agendamentoId', v_doc.appointment_id));

    -- Sai do BANCO, como pagamento.*: o documento nasce onde o agendamento
    -- nasce, em qualquer um dos caminhos. Payload magro: nada do conteúdo.
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
end $$;

-- ─── O que falta assinar num agendamento ─────────────────────────────────────
create or replace function public.documentos_pendentes_do_atendimento(p_agendamento uuid)
returns table (id uuid, title text, kind text, enforcement text, status text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.title, d.kind, d.enforcement, d.status
    from public.issued_documents d
   where d.appointment_id = p_agendamento
     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
   order by d.kind, d.title
$$;

-- ─── Cancelar os abertos de um agendamento ───────────────────────────────────
create or replace function private.documentos_cancelar_do_atendimento(p_agendamento uuid, p_motivo text, p_so_de_outro_procedimento uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_doc record;
begin
  for v_doc in
    update public.issued_documents d
       set status = 'CANCELADO', closed_reason = p_motivo, closed_at = now()
     where d.appointment_id = p_agendamento
       and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
       and (p_so_de_outro_procedimento is null or d.procedure_id is distinct from p_so_de_outro_procedimento)
    returning d.id, d.tenant_id
  loop
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
    values (v_doc.id, v_doc.tenant_id, 'CANCELADO', jsonb_build_object('motivo', p_motivo));
  end loop;
end $$;

-- ─── Gatilhos no agendamento ─────────────────────────────────────────────────
-- Depois de gravar: nascer, mudar de procedimento, check-in, cancelar.
create or replace function private.documentos_no_agendamento()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.treatment_plan_id is not null then return null; end if;

  if tg_op = 'INSERT' then
    perform public.documentos_emitir_do_atendimento(new.id,
      case when new.status in ('CONFIRMED', 'IN_PROGRESS')
           then array['AGENDAMENTO', 'INICIO_ATENDIMENTO'] else array['AGENDAMENTO'] end);
    return null;
  end if;

  if new.status in ('CANCELLED', 'NO_SHOW') and old.status is distinct from new.status then
    perform private.documentos_cancelar_do_atendimento(new.id,
      case new.status when 'CANCELLED' then 'Agendamento cancelado' else 'Cliente não compareceu' end, null);
    return null;
  end if;

  -- Trocou o procedimento: o que era do anterior não vale mais.
  if new.procedure_id is distinct from old.procedure_id then
    perform private.documentos_cancelar_do_atendimento(new.id, 'Procedimento trocado', new.procedure_id);
    perform public.documentos_emitir_do_atendimento(new.id,
      case when new.status in ('CONFIRMED', 'IN_PROGRESS')
           then array['AGENDAMENTO', 'INICIO_ATENDIMENTO'] else array['AGENDAMENTO'] end);
  end if;

  if new.status = 'CONFIRMED' and old.status is distinct from 'CONFIRMED' then
    perform public.documentos_emitir_do_atendimento(new.id, array['AGENDAMENTO', 'INICIO_ATENDIMENTO']);
  end if;
  return null;
end $$;

create trigger trg_documentos_no_agendamento
  after insert or update of status, procedure_id on public.appointments
  for each row execute function private.documentos_no_agendamento();

-- Antes de gravar: a trava do início. Emite o que ainda não nasceu (quem pula
-- o check-in, ou o agendamento feito antes de a clínica ligar o modelo) e
-- recusa se sobrar algum documento que BLOQUEIA sem assinatura.
create or replace function private.documentos_bloqueiam_inicio()
returns trigger language plpgsql security definer set search_path = '' as $$
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

  perform public.documentos_emitir_do_atendimento(new.id, array['AGENDAMENTO', 'INICIO_ATENDIMENTO']);

  select string_agg(p.title, ', ' order by p.title) into v_faltam
    from public.documentos_pendentes_do_atendimento(new.id) p
   where p.enforcement = 'BLOQUEIA';

  if v_faltam is not null then
    raise exception 'Falta assinar: %. Colha a assinatura antes de iniciar o atendimento.', v_faltam
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger trg_documentos_bloqueiam_inicio
  before update of status on public.appointments
  for each row execute function private.documentos_bloqueiam_inicio();

-- ─── Gravar o texto montado pelo app ─────────────────────────────────────────
create or replace function public.documento_registrar_render(
  p_doc uuid, p_tenant uuid, p_status text, p_conteudo text, p_texto text,
  p_sha256 text, p_faltando text[], p_codigo text
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

-- ─── Assinar: a função única dos quatro canais ───────────────────────────────
create or replace function public.documento_assinar(
  p_doc            uuid,
  p_tenant         uuid,
  p_canal          text,
  p_identidade     text,
  p_hash_exibido   text,
  p_png            text,
  p_png_sha256     text,
  p_nome           text,
  p_documento      text,
  p_ip             inet,
  p_ua             text,
  p_conduzido_por  uuid,
  p_link           uuid,
  p_scan_path      text,
  p_scan_sha256    text,
  p_aceite         text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc public.issued_documents%rowtype;
  v_em  timestamptz := now();
begin
  select * into v_doc from public.issued_documents d
   where d.id = p_doc and d.tenant_id = p_tenant
   for update;
  if not found then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;

  if v_doc.status = 'ASSINADO' then
    raise exception 'Este documento já foi assinado.' using errcode = 'P0001';
  elsif v_doc.status = 'INCOMPLETO' then
    raise exception 'Faltam dados do cliente neste documento. Complete o cadastro e gere de novo.' using errcode = 'P0001';
  elsif v_doc.status <> 'PENDENTE' then
    raise exception 'Este documento não pode mais ser assinado.' using errcode = 'P0001';
  end if;

  -- O que foi assinado é o que foi mostrado. Se o texto mudou entre abrir e
  -- assinar (dados do cliente editados, virou o dia), a assinatura não vale
  -- para o texto novo — reabre-se.
  if v_doc.content_sha256 is distinct from p_hash_exibido then
    raise exception 'O documento mudou desde que foi aberto. Abra de novo para assinar a versão atual.'
      using errcode = 'P0001';
  end if;

  insert into public.document_signatures (
    issued_document_id, tenant_id, channel, identity_method, signer_name, signer_document,
    signature_png, signature_sha256, ip, user_agent, content_sha256, conducted_by,
    link_id, scan_path, scan_sha256, accepted_text, signed_at)
  values (
    p_doc, p_tenant, p_canal, p_identidade, p_nome, p_documento,
    p_png, p_png_sha256, p_ip, p_ua, p_hash_exibido, p_conduzido_por,
    p_link, p_scan_path, p_scan_sha256, p_aceite, v_em);

  update public.issued_documents d
     set status = 'ASSINADO', signed_at = v_em
   where d.id = p_doc;

  insert into public.issued_document_events
    (issued_document_id, tenant_id, kind, actor_user_id, actor_is_client, channel, ip, user_agent)
  values (p_doc, p_tenant, 'ASSINADO', p_conduzido_por, p_canal in ('PORTAL', 'LINK'), p_canal, p_ip, p_ua);

  return jsonb_build_object('codigo', v_doc.verification_code, 'assinadoEm', v_em);
end $$;

-- ─── Dispensar (cumpre a exigência, com motivo) ──────────────────────────────
create or replace function public.documento_dispensar(p_doc uuid, p_tenant uuid, p_motivo text, p_ator uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escreva o motivo da dispensa.' using errcode = 'P0001';
  end if;
  update public.issued_documents d
     set status = 'DISPENSADO', closed_reason = trim(p_motivo), closed_by = p_ator, closed_at = now()
   where d.id = p_doc and d.tenant_id = p_tenant
     and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE');
  if not found then
    raise exception 'Este documento não está pendente.' using errcode = 'P0001';
  end if;
  insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, details)
  values (p_doc, p_tenant, 'DISPENSADO', p_ator, jsonb_build_object('motivo', trim(p_motivo)));
end $$;

-- ─── Só o servidor chama ─────────────────────────────────────────────────────
revoke execute on function public.documentos_emitir_do_atendimento(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.documentos_pendentes_do_atendimento(uuid)      from public, anon, authenticated;
revoke execute on function public.documento_registrar_render(uuid, uuid, text, text, text, text, text[], text) from public, anon, authenticated;
revoke execute on function public.documento_assinar(uuid, uuid, text, text, text, text, text, text, text, inet, text, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.documento_dispensar(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.documentos_emitir_do_atendimento(uuid, text[]) to service_role;
grant execute on function public.documentos_pendentes_do_atendimento(uuid)      to service_role;
grant execute on function public.documento_registrar_render(uuid, uuid, text, text, text, text, text[], text) to service_role;
grant execute on function public.documento_assinar(uuid, uuid, text, text, text, text, text, text, text, inet, text, uuid, uuid, text, text, text) to service_role;
grant execute on function public.documento_dispensar(uuid, uuid, text, uuid) to service_role;

-- ─── RLS: só leitura ─────────────────────────────────────────────────────────
-- A equipe lê os documentos da rede; o cliente, os DELE (o portal, fase 5).
-- A evidência e a trilha são só da equipe. Escrever pela sessão não existe.
alter table public.issued_documents       enable row level security;
alter table public.document_signatures    enable row level security;
alter table public.issued_document_events enable row level security;

create policy "issued_documents_select" on public.issued_documents for select
  using (
    (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid)
    or (public.jwt_claim('role') = 'CLIENT' and client_id::text = public.jwt_claim('client_id'))
  );
create policy "document_signatures_select" on public.document_signatures for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);
create policy "issued_document_events_select" on public.issued_document_events for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

notify pgrst, 'reload schema';
