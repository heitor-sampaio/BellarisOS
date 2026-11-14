-- Bloco Documentos, leva 2 (2026-11-14) — a revisão do Heitor de 13/11.
--
-- DC3/AG1/PC10 — uma assinatura para todos, em todo canal:
--   * O link passa a ser UM por cliente e momento. Continua uma linha de
--     `document_sign_links` por documento (o painel, a "Documentos" e as
--     travas de "um link ativo por documento" seguem lendo por
--     `issued_document_id`); as linhas de um mesmo link dividem o
--     `token_hash`. Sai o UNIQUE do hash; entra o (hash, documento).
--   * O estado do link é do GRUPO: as tentativas contam no link inteiro (a 5ª
--     errada revoga todas as linhas), a assinatura consome todas, e gerar um
--     link novo revoga o grupo antigo inteiro.
--   * `documentos_assinar`: uma assinatura, N documentos — cada um com a sua
--     evidência (a mesma imagem, o hash DELE, o seu código). Pelo link, os
--     documentos assinados têm de ser exatamente os abertos do link.
--   * `documento_assinar` e `documento_link_criar` ficam como embrulhos de um
--     documento só (as chamadas antigas continuam valendo).
--
-- PC2 / DC1c / PC9b — o pacote:
--   * `issued_documents.client_package_id` e o momento VENDA_PACOTE.
--   * `service_packages.documentos_excluidos`: o que a rede tirou dos
--     documentos puxados dos procedimentos (grava-se a EXCLUSÃO: o que a tela
--     mostra é o que nasce na venda, e documento novo do procedimento entra
--     sozinho — princípio 3).
--   * `private.modelos_do_pacote`: o termo e os outros documentos dos
--     procedimentos distintos do pacote (o contrato do procedimento não),
--     menos os excluídos, mais o contrato de pacote ativo da rede.
--   * A venda emite (gatilho AFTER INSERT em `client_packages`, menos o pacote
--     trazido de fora); cancelar o pacote cancela os abertos dele.
--   * `pacote_salvar` ganha `p_documentos_excluidos` (assinatura nova: drop e
--     create, com o mesmo grant).

-- ── O link de grupo ─────────────────────────────────────────────────────────

alter table public.document_sign_links drop constraint if exists document_sign_links_token_hash_key;
create index if not exists document_sign_links_token_hash_idx on public.document_sign_links (token_hash);
create unique index if not exists uniq_link_token_documento on public.document_sign_links (token_hash, issued_document_id);

-- Criar (ou só revogar, com o hash nulo) o link de um grupo de documentos.
create or replace function public.documentos_link_criar(
  p_docs uuid[], p_tenant uuid, p_token_hash text, p_expira timestamptz, p_ator uuid
) returns uuid[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_qtd      int;
  v_clientes int;
  v_abertos  int;
  v_hashes   text[];
  v_doc      record;
  v_ids      uuid[] := '{}';
  v_id       uuid;
begin
  if p_docs is null or cardinality(p_docs) = 0 then
    raise exception 'Nenhum documento para o link.' using errcode = 'P0001';
  end if;

  perform 1 from public.issued_documents d
   where d.id = any (p_docs) and d.tenant_id = p_tenant
   order by d.id
   for update;
  select count(*), count(distinct d.client_id), count(*) filter (where d.status = 'PENDENTE')
    into v_qtd, v_clientes, v_abertos
    from public.issued_documents d
   where d.id = any (p_docs) and d.tenant_id = p_tenant;
  if v_qtd <> (select count(distinct x) from unnest(p_docs) x) then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;

  -- O link antigo de qualquer um deles sai INTEIRO (o grupo é um link só).
  select coalesce(array_agg(distinct l.token_hash), '{}') into v_hashes
    from public.document_sign_links l
   where l.issued_document_id = any (p_docs) and l.used_at is null and l.revoked_at is null;
  for v_doc in
    update public.document_sign_links l
       set revoked_at = now()
     where l.token_hash = any (v_hashes) and l.used_at is null and l.revoked_at is null
    returning l.issued_document_id, l.tenant_id
  loop
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id)
    values (v_doc.issued_document_id, v_doc.tenant_id, 'LINK_REVOGADO', p_ator);
  end loop;

  if p_token_hash is null then return null; end if;
  if v_clientes <> 1 then
    raise exception 'Um link é de uma cliente só: os documentos são de clientes diferentes.' using errcode = 'P0001';
  end if;
  if v_abertos <> v_qtd then
    raise exception 'Este documento não está esperando assinatura.' using errcode = 'P0001';
  end if;

  for v_doc in select d.id from public.issued_documents d where d.id = any (p_docs) order by d.created_at, d.id loop
    insert into public.document_sign_links (tenant_id, issued_document_id, token_hash, expires_at, created_by)
    values (p_tenant, v_doc.id, p_token_hash, p_expira, p_ator)
    returning id into v_id;
    v_ids := v_ids || v_id;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, details)
    values (v_doc.id, p_tenant, 'LINK_GERADO', p_ator, jsonb_build_object('expira', p_expira, 'documentos', v_qtd));
  end loop;
  return v_ids;
end $$;

revoke execute on function public.documentos_link_criar(uuid[], uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.documentos_link_criar(uuid[], uuid, text, timestamptz, uuid) to service_role;

-- O de um documento só: embrulho do de grupo.
create or replace function public.documento_link_criar(
  p_doc uuid, p_tenant uuid, p_token_hash text, p_expira timestamptz, p_ator uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  return (public.documentos_link_criar(array[p_doc], p_tenant, p_token_hash, p_expira, p_ator))[1];
end $$;

revoke execute on function public.documento_link_criar(uuid, uuid, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.documento_link_criar(uuid, uuid, text, timestamptz, uuid) to service_role;

-- O estado do link para a página (antes da identidade): o do grupo.
create or replace function public.documento_link_espiar(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_qtd     int;
  v_usado   boolean;
  v_ativos  int;
  v_vencido boolean;
  v_revog   boolean;
  v_assin   boolean;
  v_doc     public.issued_documents%rowtype;
  v_cpf     text;
  v_estado  text;
begin
  select count(*),
         bool_or(l.used_at is not null),
         count(*) filter (where l.used_at is null and l.revoked_at is null and d.status = 'PENDENTE'),
         bool_or(l.used_at is null and l.revoked_at is null and d.status = 'PENDENTE' and l.expires_at < now()),
         bool_or(l.revoked_at is not null and d.status = 'PENDENTE'),
         bool_or(d.status = 'ASSINADO')
    into v_qtd, v_usado, v_ativos, v_vencido, v_revog, v_assin
    from public.document_sign_links l
    join public.issued_documents d on d.id = l.issued_document_id
   where l.token_hash = p_token_hash;
  if v_qtd = 0 then return jsonb_build_object('estado', 'invalido'); end if;

  v_estado := case
    when v_usado then 'usado'
    when v_ativos > 0 and v_vencido then 'vencido'
    when v_ativos > 0 then 'valido'
    when v_revog then 'revogado'
    when v_assin then 'usado'
    else 'indisponivel' end;

  select d.* into v_doc
    from public.document_sign_links l join public.issued_documents d on d.id = l.issued_document_id
   where l.token_hash = p_token_hash order by d.created_at, d.id limit 1;
  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g') into v_cpf from public.clients c where c.id = v_doc.client_id;
  return jsonb_build_object(
    'estado', v_estado,
    -- Quantos documentos o link pede agora (a página diz "2 documentos", sem os títulos).
    'documentos', case when v_estado = 'valido' then v_ativos else v_qtd end,
    'clinica', coalesce((select b.name from public.branches b where b.id = v_doc.branch_id),
                        (select t.name from public.tenants t where t.id = v_doc.tenant_id)),
    'pede', case when v_cpf <> '' then 'CPF' else 'NASCIMENTO' end);
end $$;

revoke execute on function public.documento_link_espiar(text) from public, anon, authenticated;
grant execute on function public.documento_link_espiar(text) to service_role;

-- Abrir: confere a identidade UMA vez para o link inteiro.
create or replace function public.documento_link_abrir(p_token_hash text, p_cpf text, p_nascimento date, p_ip inet, p_ua text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_qtd      int;
  v_usado    boolean;
  v_revog    boolean;
  v_vencido  boolean;
  v_assin    boolean;
  v_falhas   int;
  v_docs     uuid[];
  v_links    uuid[];
  v_tenant   uuid;
  v_cliente  uuid;
  v_cpf      text;
  v_nasc     date;
  v_metodo   text;
  v_ok       boolean;
  v_erros_ip int;
begin
  perform 1 from public.document_sign_links l where l.token_hash = p_token_hash order by l.id for update;
  select count(*),
         bool_or(l.used_at is not null),
         bool_or(l.revoked_at is not null and d.status = 'PENDENTE'),
         bool_or(l.revoked_at is null and l.used_at is null and d.status = 'PENDENTE' and l.expires_at < now()),
         bool_or(d.status = 'ASSINADO'),
         max(l.failed_attempts)
    into v_qtd, v_usado, v_revog, v_vencido, v_assin, v_falhas
    from public.document_sign_links l
    join public.issued_documents d on d.id = l.issued_document_id
   where l.token_hash = p_token_hash;
  if v_qtd = 0 then return jsonb_build_object('erro', 'invalido'); end if;
  if v_usado then return jsonb_build_object('erro', 'usado'); end if;

  select array_agg(d.id order by d.created_at, d.id), array_agg(l.id order by d.created_at, d.id),
         min(d.tenant_id::text)::uuid, min(d.client_id::text)::uuid
    into v_docs, v_links, v_tenant, v_cliente
    from public.document_sign_links l
    join public.issued_documents d on d.id = l.issued_document_id
   where l.token_hash = p_token_hash and l.used_at is null and l.revoked_at is null and d.status = 'PENDENTE';

  if v_docs is null then
    if v_revog then return jsonb_build_object('erro', 'revogado'); end if;
    if v_assin then return jsonb_build_object('erro', 'usado'); end if;
    return jsonb_build_object('erro', 'indisponivel');
  end if;
  if v_vencido then return jsonb_build_object('erro', 'vencido'); end if;

  if p_ip is not null then
    select count(*) into v_erros_ip from public.document_link_attempts a
     where a.ip = p_ip and not a.ok and a.created_at > now() - interval '1 hour';
    if v_erros_ip >= 20 then return jsonb_build_object('erro', 'limite'); end if;
  end if;

  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g'), (c.birth_date at time zone 'UTC')::date
    into v_cpf, v_nasc
    from public.clients c where c.id = v_cliente;

  if v_cpf <> '' then
    v_metodo := 'CPF';
    v_ok := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') = v_cpf;
  elsif v_nasc is not null then
    v_metodo := 'NASCIMENTO';
    v_ok := p_nascimento is not null and p_nascimento = v_nasc;
  else
    return jsonb_build_object('erro', 'sem_identidade');
  end if;

  insert into public.document_link_attempts (link_id, ip, ok) values (v_links[1], p_ip, v_ok);

  if not v_ok then
    -- As tentativas são do LINK: todas as linhas do grupo contam e caem juntas.
    update public.document_sign_links l
       set failed_attempts = v_falhas + 1,
           revoked_at = case when v_falhas + 1 >= 5 and l.revoked_at is null and l.used_at is null then now() else l.revoked_at end
     where l.token_hash = p_token_hash;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_is_client, channel, ip, user_agent)
    select x, v_tenant, 'IDENTIDADE_FALHOU', true, 'LINK', p_ip, p_ua from unnest(v_docs) x;
    return jsonb_build_object('erro', case when v_falhas + 1 >= 5 then 'revogado' else 'identidade' end,
                              'restantes', greatest(0, 4 - v_falhas));
  end if;

  insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_is_client, channel, ip, user_agent)
  select x, v_tenant, 'IDENTIDADE_OK', true, 'LINK', p_ip, p_ua from unnest(v_docs) x;
  return jsonb_build_object('ok', true, 'documentos', to_jsonb(v_docs), 'documento', v_docs[1],
                            'tenant', v_tenant, 'link', v_links[1], 'metodo', v_metodo);
end $$;

revoke execute on function public.documento_link_abrir(text, text, date, inet, text) from public, anon, authenticated;
grant execute on function public.documento_link_abrir(text, text, date, inet, text) to service_role;

-- Uma assinatura, N documentos. `p_itens`: [{ "id": uuid, "hash": "<sha-256 do que se viu>" }].
create or replace function public.documentos_assinar(
  p_tenant uuid, p_itens jsonb, p_canal text, p_identidade text,
  p_png text, p_png_sha256 text, p_nome text, p_documento text, p_ip inet, p_ua text,
  p_conduzido_por uuid, p_link_hash text, p_scan_path text, p_scan_sha256 text, p_aceite text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_em      timestamptz := now();
  v_ids     uuid[];
  v_qtd     int;
  v_clientes int;
  v_doc     public.issued_documents%rowtype;
  v_hash    text;
  v_link    uuid;
  v_abertos uuid[];
  v_saida   jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum documento para assinar.' using errcode = 'P0001';
  end if;
  select array_agg(distinct (i ->> 'id')::uuid) into v_ids from jsonb_array_elements(p_itens) i;
  if cardinality(v_ids) <> jsonb_array_length(p_itens) then
    raise exception 'Documento repetido na assinatura.' using errcode = 'P0001';
  end if;

  perform 1 from public.issued_documents d where d.id = any (v_ids) and d.tenant_id = p_tenant order by d.id for update;
  select count(*), count(distinct d.client_id) into v_qtd, v_clientes
    from public.issued_documents d where d.id = any (v_ids) and d.tenant_id = p_tenant;
  if v_qtd <> cardinality(v_ids) then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;
  if v_clientes <> 1 then
    raise exception 'Uma assinatura é de uma cliente só: os documentos são de clientes diferentes.' using errcode = 'P0001';
  end if;

  if p_canal = 'LINK' then
    perform 1 from public.document_sign_links l where l.token_hash = p_link_hash order by l.id for update;
    select array_agg(l.issued_document_id order by l.issued_document_id) into v_abertos
      from public.document_sign_links l
      join public.issued_documents d on d.id = l.issued_document_id
     where l.token_hash = p_link_hash and l.tenant_id = p_tenant
       and l.used_at is null and l.revoked_at is null and l.expires_at >= now() and d.status = 'PENDENTE';
    if p_link_hash is null or v_abertos is null then
      raise exception 'Este link não vale mais. Peça um novo à clínica.' using errcode = 'P0001';
    end if;
    -- Pelo link, assina-se o link inteiro: nem a mais, nem a menos.
    if v_abertos <> (select array_agg(x order by x) from unnest(v_ids) x) then
      raise exception 'Os documentos deste link mudaram. Abra o link de novo para assinar.' using errcode = 'P0001';
    end if;
    update public.document_sign_links l set used_at = v_em where l.token_hash = p_link_hash and l.used_at is null;
  end if;

  for v_doc in select d.* from public.issued_documents d where d.id = any (v_ids) order by d.created_at, d.id loop
    if v_doc.status = 'ASSINADO' then
      raise exception 'Este documento já foi assinado: %.', v_doc.title using errcode = 'P0001';
    elsif v_doc.status = 'INCOMPLETO' then
      raise exception 'Faltam dados do cliente neste documento: %. Complete o cadastro e gere de novo.', v_doc.title using errcode = 'P0001';
    elsif v_doc.status <> 'PENDENTE' then
      raise exception 'Este documento não pode mais ser assinado: %.', v_doc.title using errcode = 'P0001';
    end if;

    select i ->> 'hash' into v_hash from jsonb_array_elements(p_itens) i where (i ->> 'id')::uuid = v_doc.id;
    if v_doc.content_sha256 is distinct from v_hash then
      raise exception 'O documento mudou desde que foi aberto. Abra de novo para assinar a versão atual.'
        using errcode = 'P0001';
    end if;

    v_link := null;
    if p_canal = 'LINK' then
      select l.id into v_link from public.document_sign_links l
       where l.token_hash = p_link_hash and l.issued_document_id = v_doc.id;
    end if;

    insert into public.document_signatures (
      issued_document_id, tenant_id, channel, identity_method, signer_name, signer_document,
      signature_png, signature_sha256, ip, user_agent, content_sha256, conducted_by,
      link_id, scan_path, scan_sha256, accepted_text, signed_at)
    values (
      v_doc.id, p_tenant, p_canal, p_identidade, p_nome, p_documento,
      p_png, p_png_sha256, p_ip, p_ua, v_hash, p_conduzido_por,
      v_link, p_scan_path, p_scan_sha256, p_aceite, v_em);

    update public.issued_documents d set status = 'ASSINADO', signed_at = v_em where d.id = v_doc.id;

    -- O link de OUTRO grupo em que ele estava não vale mais para ele.
    update public.document_sign_links l set revoked_at = v_em
     where l.issued_document_id = v_doc.id and l.used_at is null and l.revoked_at is null;

    insert into public.issued_document_events
      (issued_document_id, tenant_id, kind, actor_user_id, actor_is_client, channel, ip, user_agent, details)
    values (v_doc.id, p_tenant, 'ASSINADO', p_conduzido_por, p_canal in ('PORTAL', 'LINK'), p_canal, p_ip, p_ua,
            case when v_qtd > 1 then jsonb_build_object('juntos', v_qtd) end);

    v_saida := v_saida || jsonb_build_object('id', v_doc.id, 'codigo', v_doc.verification_code);
  end loop;

  return jsonb_build_object('documentos', v_saida, 'assinadoEm', v_em);
end $$;

revoke execute on function public.documentos_assinar(uuid, jsonb, text, text, text, text, text, text, inet, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.documentos_assinar(uuid, jsonb, text, text, text, text, text, text, inet, text, uuid, text, text, text, text) to service_role;

-- O de um documento só: embrulho. Pelo link, `p_link` é a linha DESTE documento.
create or replace function public.documento_assinar(
  p_doc uuid, p_tenant uuid, p_canal text, p_identidade text, p_hash_exibido text, p_png text, p_png_sha256 text,
  p_nome text, p_documento text, p_ip inet, p_ua text, p_conduzido_por uuid, p_link uuid,
  p_scan_path text, p_scan_sha256 text, p_aceite text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_hash_link text;
  v_r         jsonb;
begin
  if p_canal = 'LINK' then
    select l.token_hash into v_hash_link from public.document_sign_links l
     where l.id = p_link and l.issued_document_id = p_doc;
    if v_hash_link is null then
      raise exception 'Este link não vale mais. Peça um novo à clínica.' using errcode = 'P0001';
    end if;
  end if;
  v_r := public.documentos_assinar(
    p_tenant, jsonb_build_array(jsonb_build_object('id', p_doc, 'hash', p_hash_exibido)), p_canal, p_identidade,
    p_png, p_png_sha256, p_nome, p_documento, p_ip, p_ua, p_conduzido_por, v_hash_link, p_scan_path, p_scan_sha256, p_aceite);
  return jsonb_build_object('codigo', v_r -> 'documentos' -> 0 ->> 'codigo', 'assinadoEm', v_r -> 'assinadoEm');
end $$;

revoke execute on function public.documento_assinar(uuid, uuid, text, text, text, text, text, text, text, inet, text, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.documento_assinar(uuid, uuid, text, text, text, text, text, text, text, inet, text, uuid, uuid, text, text, text) to service_role;

-- ── O pacote ────────────────────────────────────────────────────────────────

alter table public.issued_documents
  add column if not exists client_package_id uuid references public.client_packages (id) on delete cascade;
create index if not exists issued_documents_client_package_id_idx on public.issued_documents (client_package_id);
create unique index if not exists uniq_documento_do_pacote on public.issued_documents (client_package_id, template_id)
  where client_package_id is not null and status not in ('CANCELADO', 'SUBSTITUIDO');

alter table public.issued_documents drop constraint if exists issued_documents_moment_check;
alter table public.issued_documents add constraint issued_documents_moment_check
  check (moment in ('AGENDAMENTO', 'INICIO_ATENDIMENTO', 'FECHAMENTO_PLANO', 'VENDA_PACOTE', 'LEGADO'));

alter table public.service_packages
  add column if not exists documentos_excluidos uuid[] not null default '{}';

-- O que a venda de um pacote emite: o termo e os outros documentos dos
-- procedimentos distintos (o contrato do procedimento não), menos os que a
-- rede excluiu no pacote, e o contrato de pacote ativo da rede.
create or replace function private.modelos_do_pacote(p_pacote_vendido uuid)
returns table(template_id uuid, version_id uuid, kind text, source text, title text, enforcement text, procedure_id uuid)
language sql stable security definer set search_path = ''
as $$
  with vendido as (
    select cp.id, cp.package_id, b.tenant_id, sp.documentos_excluidos
      from public.client_packages cp
      join public.branches b on b.id = cp.branch_id
      join public.service_packages sp on sp.id = cp.package_id
     where cp.id = p_pacote_vendido
  ), procs as (
    select distinct i.procedure_id from vendido v join public.service_package_items i on i.package_id = v.package_id
    union
    -- O pacote antigo, de um procedimento só (sem itens).
    select sp.procedure_id from vendido v join public.service_packages sp on sp.id = v.package_id
     where not exists (select 1 from public.service_package_items i where i.package_id = v.package_id)
  ), puxados as (
    select distinct on (t.id) t.id, ver.id as versao, t.kind, t.source, t.name, t.enforcement, p.id as proc
      from vendido v
      join procs on true
      join public.procedures p on p.id = procs.procedure_id and p.tenant_id = v.tenant_id
      join public.document_templates t
        on t.tenant_id = v.tenant_id and (t.id = p.consent_template_id or t.id = any (p.outros_documentos))
      join public.document_template_versions ver on ver.template_id = t.id and ver.version = t.current_version
     where t.is_active and t.kind in ('TERMO', 'DOCUMENTO')
       and not (t.id = any (v.documentos_excluidos))
     order by t.id, p.name
  )
  select puxados.id, puxados.versao, puxados.kind, puxados.source, puxados.name, puxados.enforcement, puxados.proc from puxados
  union all
  select t.id, ver.id, t.kind, t.source, t.name, t.enforcement, null::uuid
    from vendido v
    join public.document_templates t on t.tenant_id = v.tenant_id and t.kind = 'CONTRATO_PACOTE' and t.is_active
    join public.document_template_versions ver on ver.template_id = t.id and ver.version = t.current_version
$$;

revoke execute on function private.modelos_do_pacote(uuid) from public, anon, authenticated;

create or replace function public.documentos_emitir_do_pacote(p_pacote_vendido uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc   record;
  v_total int := 0;
begin
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
       -- Termos e contratos são do PLANO da rede (lib/planos/recursos.ts).
       and private.rede_tem_recurso(b.tenant_id, 'documentos')
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

-- A venda emite; o cancelamento cancela o que estava aberto.
create or replace function private.documentos_do_pacote_vendido()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc record;
begin
  if tg_op = 'INSERT' then
    if not new.de_fora then perform public.documentos_emitir_do_pacote(new.id); end if;
    return null;
  end if;
  if new.cancelado_em is not null and old.cancelado_em is null then
    for v_doc in
      update public.issued_documents d
         set status = 'CANCELADO', closed_reason = 'Pacote cancelado', closed_at = now()
       where d.client_package_id = new.id and d.status in ('A_GERAR', 'INCOMPLETO', 'PENDENTE')
      returning d.id, d.tenant_id
    loop
      insert into public.issued_document_events (issued_document_id, tenant_id, kind, details)
      values (v_doc.id, v_doc.tenant_id, 'CANCELADO', jsonb_build_object('motivo', 'Pacote cancelado'));
      update public.document_sign_links l set revoked_at = now()
       where l.issued_document_id = v_doc.id and l.used_at is null and l.revoked_at is null;
    end loop;
  end if;
  return null;
end $$;

revoke execute on function private.documentos_do_pacote_vendido() from public, anon, authenticated;

drop trigger if exists trg_documentos_do_pacote_vendido on public.client_packages;
create trigger trg_documentos_do_pacote_vendido
  after insert or update of cancelado_em on public.client_packages
  for each row execute function private.documentos_do_pacote_vendido();

-- pacote_salvar: + p_documentos_excluidos (nulo = não mexe). Do corpo de produção.
drop function if exists public.pacote_salvar(uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb);

create function public.pacote_salvar(
  p_tenant uuid, p_id uuid, p_nome text, p_preco numeric, p_validade integer, p_ativo boolean, p_itens jsonb,
  p_comissao jsonb default null::jsonb, p_documentos_excluidos uuid[] default null
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_id     uuid := p_id;
  v_total  int;
  v_prim   uuid;
  v_vtipo  text;
  v_vvalor numeric;
  v_etipo  text;
  v_evalor numeric;
  v_rtipo  text;
  v_rvalor numeric;
  v_excl   uuid[];
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um procedimento ao pacote.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
     where not exists (select 1 from public.procedures p where p.id = (i ->> 'procedure_id')::uuid and p.tenant_id = p_tenant)
  ) then
    raise exception 'Procedimento não encontrado.' using errcode = 'no_data_found';
  end if;
  select sum((i ->> 'quantity')::int), (array_agg((i ->> 'procedure_id')::uuid order by n))[1]
    into v_total, v_prim
    from jsonb_array_elements(p_itens) with ordinality as t(i, n);
  if v_total < 2 then
    raise exception 'Um pacote tem pelo menos 2 sessões.' using errcode = 'P0001';
  end if;

  -- Só modelos da rede entram na exclusão (o resto não tiraria nada).
  if p_documentos_excluidos is not null then
    select coalesce(array_agg(distinct t.id), '{}') into v_excl
      from public.document_templates t
     where t.tenant_id = p_tenant and t.id = any (p_documentos_excluidos);
  end if;

  if p_comissao is not null then
    v_vtipo  := nullif(p_comissao #>> '{venda,tipo}', '');
    v_vvalor := case when v_vtipo is null then null else round((p_comissao #>> '{venda,valor}')::numeric, 2) end;
    v_etipo  := coalesce(nullif(p_comissao #>> '{execucao,tipo}', ''), 'REGRA');
    v_evalor := case when v_etipo in ('PERCENTAGE', 'FIXED_AMOUNT') then round((p_comissao #>> '{execucao,valor}')::numeric, 2) end;
    -- com-04: "sobre o valor do pacote", para a profissional responsável da venda.
    if v_etipo = 'PACOTE' then
      v_rtipo  := nullif(p_comissao #>> '{execucao,valorTipo}', '');
      v_rvalor := round((p_comissao #>> '{execucao,valor}')::numeric, 2);
      if v_rtipo is null or v_rtipo not in ('PERCENTAGE', 'FIXED_AMOUNT') or v_rvalor is null or v_rvalor < 0
         or (v_rtipo = 'PERCENTAGE' and v_rvalor > 100) then
        raise exception 'Valor de comissão inválido (o percentual vai de 0 a 100).' using errcode = 'P0001';
      end if;
      v_etipo  := 'NENHUMA';
      v_evalor := null;
    end if;
    if v_vtipo is not null and v_vtipo not in ('PERCENTAGE', 'FIXED_AMOUNT') then
      raise exception 'Comissão de venda inválida.' using errcode = 'P0001';
    end if;
    if v_etipo not in ('REGRA', 'PERCENTAGE', 'FIXED_AMOUNT', 'NENHUMA') then
      raise exception 'Comissão de execução inválida.' using errcode = 'P0001';
    end if;
    if (v_vtipo is not null and (v_vvalor is null or v_vvalor < 0 or (v_vtipo = 'PERCENTAGE' and v_vvalor > 100)))
       or (v_etipo in ('PERCENTAGE', 'FIXED_AMOUNT') and (v_evalor is null or v_evalor < 0 or (v_etipo = 'PERCENTAGE' and v_evalor > 100))) then
      raise exception 'Valor de comissão inválido (o percentual vai de 0 a 100).' using errcode = 'P0001';
    end if;
  end if;

  if v_id is null then
    insert into public.service_packages (tenant_id, branch_id, procedure_id, name, total_sessions, price, validity_days, is_active,
      comissao_venda_tipo, comissao_venda_valor, comissao_execucao, comissao_execucao_valor, comissao_responsavel_tipo, comissao_responsavel_valor,
      documentos_excluidos)
    values (p_tenant, null, v_prim, trim(p_nome), v_total, round(p_preco, 2), p_validade, p_ativo,
      v_vtipo::public."CommissionType", v_vvalor, coalesce(v_etipo, 'REGRA'), v_evalor, v_rtipo::public."CommissionType", v_rvalor,
      coalesce(v_excl, '{}'))
    returning id into v_id;
  else
    update public.service_packages
       set procedure_id = v_prim, name = trim(p_nome), total_sessions = v_total, price = round(p_preco, 2),
           validity_days = p_validade, is_active = p_ativo,
           comissao_venda_tipo     = case when p_comissao is null then comissao_venda_tipo else v_vtipo::public."CommissionType" end,
           comissao_venda_valor    = case when p_comissao is null then comissao_venda_valor else v_vvalor end,
           comissao_execucao       = case when p_comissao is null then comissao_execucao else v_etipo end,
           comissao_execucao_valor = case when p_comissao is null then comissao_execucao_valor else v_evalor end,
           comissao_responsavel_tipo  = case when p_comissao is null then comissao_responsavel_tipo else v_rtipo::public."CommissionType" end,
           comissao_responsavel_valor = case when p_comissao is null then comissao_responsavel_valor else v_rvalor end,
           documentos_excluidos    = coalesce(v_excl, documentos_excluidos)
     where id = v_id and tenant_id = p_tenant;
    if not found then
      raise exception 'Pacote não encontrado.' using errcode = 'no_data_found';
    end if;
    delete from public.service_package_items where package_id = v_id;
  end if;

  insert into public.service_package_items (tenant_id, package_id, procedure_id, quantity, sort_order)
  select p_tenant, v_id, (i ->> 'procedure_id')::uuid, (i ->> 'quantity')::int, n::int - 1
    from jsonb_array_elements(p_itens) with ordinality as t(i, n);

  return v_id;
end $function$;

revoke execute on function public.pacote_salvar(uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.pacote_salvar(uuid, uuid, text, numeric, integer, boolean, jsonb, jsonb, uuid[]) to service_role;

notify pgrst, 'reload schema';
