-- Termos e contratos — fase 6: o LINK público de assinatura.
--
-- A equipe gera um link e o manda ao cliente (copiar, ou abrir no WhatsApp).
-- Ele abre SEM login e, antes de ver o documento, confirma quem é: o CPF, ou a
-- data de nascimento quando o cadastro não tem CPF.
--
-- - O token nunca fica no banco: só o SHA-256 dele (como senha).
-- - Uso único, 7 dias, um link ativo por documento (gerar outro revoga o
--   anterior).
-- - 5 erros de identidade revogam o link; 20 erros por IP em uma hora
--   bloqueiam o IP. A contagem mora AQUI, com o link travado: tentativas em
--   paralelo não furam o limite.
-- - As duas tabelas têm RLS ligada e ZERO políticas, como credencial (§4): só
--   o servidor lê.

create table public.document_sign_links (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id),
  issued_document_id uuid not null references public.issued_documents(id) on delete cascade,
  token_hash         text not null unique,
  expires_at         timestamptz not null,
  used_at            timestamptz,
  revoked_at         timestamptz,
  failed_attempts    int not null default 0,
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now()
);
create unique index uniq_link_ativo_do_documento on public.document_sign_links (issued_document_id)
  where used_at is null and revoked_at is null;

create table public.document_link_attempts (
  id         bigserial primary key,
  link_id    uuid references public.document_sign_links(id) on delete cascade,
  ip         inet,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index idx_document_link_attempts_ip on public.document_link_attempts (ip, created_at);

alter table public.document_sign_links    enable row level security;
alter table public.document_link_attempts enable row level security;

alter table public.document_signatures
  add constraint document_signatures_link_fkey foreign key (link_id) references public.document_sign_links(id);

-- ─── Gerar (ou só revogar, com token nulo) ───────────────────────────────────
create or replace function public.documento_link_criar(
  p_doc uuid, p_tenant uuid, p_token_hash text, p_expira timestamptz, p_ator uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_link   uuid;
begin
  select d.status into v_status from public.issued_documents d
   where d.id = p_doc and d.tenant_id = p_tenant for update;
  if not found then
    raise exception 'Documento não encontrado.' using errcode = 'no_data_found';
  end if;

  update public.document_sign_links l
     set revoked_at = now()
   where l.issued_document_id = p_doc and l.used_at is null and l.revoked_at is null;
  if found then
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id)
    values (p_doc, p_tenant, 'LINK_REVOGADO', p_ator);
  end if;

  if p_token_hash is null then return null; end if;
  if v_status <> 'PENDENTE' then
    raise exception 'Este documento não está esperando assinatura.' using errcode = 'P0001';
  end if;

  insert into public.document_sign_links (tenant_id, issued_document_id, token_hash, expires_at, created_by)
  values (p_tenant, p_doc, p_token_hash, p_expira, p_ator)
  returning id into v_link;
  insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_user_id, details)
  values (p_doc, p_tenant, 'LINK_GERADO', p_ator, jsonb_build_object('expira', p_expira));
  return v_link;
end $$;

-- ─── Espiar: o que a página mostra ANTES da identidade ───────────────────────
-- Só a clínica e o que ela vai pedir (CPF ou nascimento). Nada do documento:
-- o título pode dizer o procedimento, e quem tem o link na mão pode não ser o
-- cliente. Quem tem o link fica sabendo se o cadastro tem CPF: é o mínimo
-- para a tela pedir a coisa certa, e não diz de quem é.
create or replace function public.documento_link_espiar(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_link public.document_sign_links%rowtype;
  v_doc  public.issued_documents%rowtype;
  v_cpf  text;
begin
  select * into v_link from public.document_sign_links l where l.token_hash = p_token_hash;
  if not found then return jsonb_build_object('estado', 'invalido'); end if;
  select * into v_doc from public.issued_documents d where d.id = v_link.issued_document_id;
  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g') into v_cpf from public.clients c where c.id = v_doc.client_id;
  return jsonb_build_object(
    'estado', case
      when v_link.used_at is not null or v_doc.status = 'ASSINADO' then 'usado'
      when v_link.revoked_at is not null then 'revogado'
      when v_link.expires_at < now() then 'vencido'
      when v_doc.status <> 'PENDENTE' then 'indisponivel'
      else 'valido' end,
    'clinica', coalesce((select b.name from public.branches b where b.id = v_doc.branch_id),
                        (select t.name from public.tenants t where t.id = v_doc.tenant_id)),
    'pede', case when v_cpf <> '' then 'CPF' else 'NASCIMENTO' end);
end $$;

-- ─── Abrir: confere a identidade, conta as tentativas ────────────────────────
-- Devolve jsonb em vez de lançar: a tentativa errada TEM de ficar gravada, e
-- um RAISE desfaria a gravação junto.
create or replace function public.documento_link_abrir(
  p_token_hash text, p_cpf text, p_nascimento date, p_ip inet, p_ua text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_link    public.document_sign_links%rowtype;
  v_doc     public.issued_documents%rowtype;
  v_cpf     text;
  v_nasc    date;
  v_metodo  text;
  v_ok      boolean;
  v_erros_ip int;
begin
  select * into v_link from public.document_sign_links l where l.token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('erro', 'invalido'); end if;
  if v_link.used_at is not null then return jsonb_build_object('erro', 'usado'); end if;
  if v_link.revoked_at is not null then return jsonb_build_object('erro', 'revogado'); end if;
  if v_link.expires_at < now() then return jsonb_build_object('erro', 'vencido'); end if;

  if p_ip is not null then
    select count(*) into v_erros_ip from public.document_link_attempts a
     where a.ip = p_ip and not a.ok and a.created_at > now() - interval '1 hour';
    if v_erros_ip >= 20 then return jsonb_build_object('erro', 'limite'); end if;
  end if;

  select * into v_doc from public.issued_documents d where d.id = v_link.issued_document_id;
  if v_doc.status = 'ASSINADO' then return jsonb_build_object('erro', 'usado'); end if;
  if v_doc.status <> 'PENDENTE' then return jsonb_build_object('erro', 'indisponivel'); end if;

  -- birth_date é timestamptz gravado à meia-noite UTC: o dia é o do UTC.
  select regexp_replace(coalesce(c.document, ''), '\D', '', 'g'), (c.birth_date at time zone 'UTC')::date
    into v_cpf, v_nasc
    from public.clients c where c.id = v_doc.client_id;

  if v_cpf <> '' then
    v_metodo := 'CPF';
    v_ok := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') = v_cpf;
  elsif v_nasc is not null then
    v_metodo := 'NASCIMENTO';
    v_ok := p_nascimento is not null and p_nascimento = v_nasc;
  else
    return jsonb_build_object('erro', 'sem_identidade');
  end if;

  insert into public.document_link_attempts (link_id, ip, ok) values (v_link.id, p_ip, v_ok);

  if not v_ok then
    update public.document_sign_links l
       set failed_attempts = l.failed_attempts + 1,
           revoked_at = case when l.failed_attempts + 1 >= 5 then now() else l.revoked_at end
     where l.id = v_link.id;
    insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_is_client, channel, ip, user_agent)
    values (v_doc.id, v_doc.tenant_id, 'IDENTIDADE_FALHOU', true, 'LINK', p_ip, p_ua);
    return jsonb_build_object('erro', case when v_link.failed_attempts + 1 >= 5 then 'revogado' else 'identidade' end,
                              'restantes', greatest(0, 4 - v_link.failed_attempts));
  end if;

  insert into public.issued_document_events (issued_document_id, tenant_id, kind, actor_is_client, channel, ip, user_agent)
  values (v_doc.id, v_doc.tenant_id, 'IDENTIDADE_OK', true, 'LINK', p_ip, p_ua);
  return jsonb_build_object('ok', true, 'documento', v_doc.id, 'tenant', v_doc.tenant_id, 'link', v_link.id, 'metodo', v_metodo);
end $$;

-- ─── Assinar: agora também confere e consome o link ──────────────────────────
create or replace function public.documento_assinar(
  p_doc uuid, p_tenant uuid, p_canal text, p_identidade text, p_hash_exibido text,
  p_png text, p_png_sha256 text, p_nome text, p_documento text, p_ip inet, p_ua text,
  p_conduzido_por uuid, p_link uuid, p_scan_path text, p_scan_sha256 text, p_aceite text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_doc  public.issued_documents%rowtype;
  v_link public.document_sign_links%rowtype;
  v_em   timestamptz := now();
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

  if v_doc.content_sha256 is distinct from p_hash_exibido then
    raise exception 'O documento mudou desde que foi aberto. Abra de novo para assinar a versão atual.'
      using errcode = 'P0001';
  end if;

  -- Pelo link: ele tem de ser DESTE documento e ainda valer — e é consumido
  -- aqui, na mesma transação. Dois cliques no mesmo link assinam uma vez.
  if p_canal = 'LINK' then
    select * into v_link from public.document_sign_links l
     where l.id = p_link and l.issued_document_id = p_doc
     for update;
    if not found or v_link.used_at is not null or v_link.revoked_at is not null or v_link.expires_at < now() then
      raise exception 'Este link não vale mais. Peça um novo à clínica.' using errcode = 'P0001';
    end if;
    update public.document_sign_links l set used_at = v_em where l.id = p_link;
  end if;

  insert into public.document_signatures (
    issued_document_id, tenant_id, channel, identity_method, signer_name, signer_document,
    signature_png, signature_sha256, ip, user_agent, content_sha256, conducted_by,
    link_id, scan_path, scan_sha256, accepted_text, signed_at)
  values (
    p_doc, p_tenant, p_canal, p_identidade, p_nome, p_documento,
    p_png, p_png_sha256, p_ip, p_ua, p_hash_exibido, p_conduzido_por,
    case when p_canal = 'LINK' then p_link end, p_scan_path, p_scan_sha256, p_aceite, v_em);

  update public.issued_documents d
     set status = 'ASSINADO', signed_at = v_em
   where d.id = p_doc;

  -- Os outros links do documento deixam de valer.
  update public.document_sign_links l set revoked_at = v_em
   where l.issued_document_id = p_doc and l.used_at is null and l.revoked_at is null;

  insert into public.issued_document_events
    (issued_document_id, tenant_id, kind, actor_user_id, actor_is_client, channel, ip, user_agent)
  values (p_doc, p_tenant, 'ASSINADO', p_conduzido_por, p_canal in ('PORTAL', 'LINK'), p_canal, p_ip, p_ua);

  return jsonb_build_object('codigo', v_doc.verification_code, 'assinadoEm', v_em);
end $$;

revoke execute on function public.documento_link_criar(uuid, uuid, text, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.documento_link_espiar(text) from public, anon, authenticated;
revoke execute on function public.documento_link_abrir(text, text, date, inet, text) from public, anon, authenticated;
grant execute on function public.documento_link_criar(uuid, uuid, text, timestamptz, uuid) to service_role;
grant execute on function public.documento_link_espiar(text) to service_role;
grant execute on function public.documento_link_abrir(text, text, date, inet, text) to service_role;

notify pgrst, 'reload schema';
