-- D-5 (decisão do Heitor, 2026-10-29): "Um contrato de plano ativo só, e dá
-- para TROCAR qual é o ativo direto. Fica o fluxo de trocar; sai o de criar
-- outro e desativar o atual antes."
--
-- Até aqui o contrato de plano novo nascia ATIVO e o índice único
-- (uniq_contrato_de_plano_ativo) o recusava quando a rede já tinha um: a tela
-- dizia "Desative o atual antes" e o texto escrito se perdia.
--
-- 1. documento_modelo_salvar: o contrato de plano novo nasce INATIVO quando a
--    rede já tem um ativo (o primeiro continua nascendo ativo). O resto da
--    função é o mesmo.
-- 2. documento_contrato_de_plano_ativar: troca o ativo numa transação só —
--    desliga o atual e liga o escolhido. O índice continua garantindo um só.

create or replace function public.documento_modelo_salvar(
  p_tenant uuid, p_modelo uuid, p_nome text, p_tipo text, p_origem text, p_momento text,
  p_exigencia text, p_texto text, p_arquivo_path text, p_arquivo_sha256 text, p_arquivo_nome text,
  p_arquivo_tamanho integer, p_arquivo_paginas integer, p_variaveis text[], p_usa_pagamento boolean,
  p_ator uuid, p_documento jsonb default null::jsonb)
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
    -- Um contrato de plano ativo por rede: o segundo nasce inativo, e a troca
    -- é documento_contrato_de_plano_ativar.
    v_ativo := not (p_tipo = 'CONTRATO_PLANO' and exists (
      select 1 from public.document_templates t
       where t.tenant_id = p_tenant and t.kind = 'CONTRATO_PLANO' and t.is_active));

    insert into public.document_templates (tenant_id, name, kind, source, moment, enforcement, created_by, is_active)
    values (p_tenant, trim(p_nome), p_tipo, p_origem,
            case when p_tipo = 'CONTRATO_PLANO' then null else p_momento end,
            p_exigencia, p_ator, v_ativo)
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
         moment          = case when t.kind = 'CONTRATO_PLANO' then null else p_momento end,
         enforcement     = p_exigencia,
         current_version = v_versao,
         updated_at      = now()
   where t.id = p_modelo;

  return jsonb_build_object('id', p_modelo, 'versao', v_versao, 'novaVersao', v_mudou, 'ativo', v_modelo.is_active);
end $function$;

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
  if not found or v_modelo.kind <> 'CONTRATO_PLANO' then
    raise exception 'Contrato de plano não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Desliga o atual ANTES de ligar o escolhido: o índice único é imediato.
  update public.document_templates t
     set is_active = false, updated_at = now()
   where t.tenant_id = p_tenant and t.kind = 'CONTRATO_PLANO' and t.is_active and t.id <> p_modelo
  returning t.id into v_anterior;

  update public.document_templates t
     set is_active = true, updated_at = now()
   where t.id = p_modelo and not t.is_active;

  return jsonb_build_object('id', p_modelo, 'anterior', v_anterior);
end $function$;

revoke execute on function public.documento_contrato_de_plano_ativar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.documento_contrato_de_plano_ativar(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
