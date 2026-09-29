-- Termos e contratos — o editor rico (fonte, tamanho, negrito, itálico,
-- tabelas, imagens, cabeçalho e rodapé; decisão do Heitor, 2026-09-29).
--
-- A versão de um modelo do editor passa a guardar o JSON do editor
-- (`body_doc`: { corpo, cabecalho?, rodape? }) em vez da marcação leve. O que
-- se ASSINA continua sendo a árvore própria do sistema, montada pelo conversor
-- no servidor (`lib/documentos/editor/converter.ts`) — o JSON do editor nunca
-- vai para a tela como HTML.
--
-- A marcação antiga continua valendo (as versões já gravadas e o contrato de
-- plano semeado por `documentos_modelos_padrao`): o app a converte para o
-- mesmo JSON antes de montar. Uma versão tem UMA das duas, nunca as duas.
--
-- Compatível com o código no ar: a função nova aceita as chamadas de antes
-- (`p_documento` tem default), e só o editor novo grava `body_doc`.

alter table public.document_template_versions
  add column body_doc jsonb;

alter table public.document_template_versions
  drop constraint document_template_versions_conteudo;
alter table public.document_template_versions
  add constraint document_template_versions_conteudo check (
    (source = 'EDITOR' and file_path is null and ((body_markup is not null) <> (body_doc is not null)))
    or (source = 'ARQUIVO' and file_path is not null and file_sha256 is not null and body_markup is null and body_doc is null)
  );

drop function public.documento_modelo_salvar(uuid, uuid, text, text, text, text, text, text, text, text, text, int, int, text[], boolean, uuid);

create function public.documento_modelo_salvar(
  p_tenant           uuid,
  p_modelo           uuid,
  p_nome             text,
  p_tipo             text,
  p_origem           text,
  p_momento          text,
  p_exigencia        text,
  p_texto            text,
  p_arquivo_path     text,
  p_arquivo_sha256   text,
  p_arquivo_nome     text,
  p_arquivo_tamanho  int,
  p_arquivo_paginas  int,
  p_variaveis        text[],
  p_usa_pagamento    boolean,
  p_ator             uuid,
  -- O JSON do editor rico. Com ele, `p_texto` é ignorado.
  p_documento        jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_modelo  public.document_templates%rowtype;
  v_atual   public.document_template_versions%rowtype;
  v_id      uuid;
  v_versao  int;
  v_mudou   boolean;
  v_markup  text  := case when p_origem = 'EDITOR' and p_documento is null then p_texto end;
  v_doc     jsonb := case when p_origem = 'EDITOR' then p_documento end;
begin
  if p_modelo is null then
    insert into public.document_templates (tenant_id, name, kind, source, moment, enforcement, created_by)
    values (p_tenant, trim(p_nome), p_tipo, p_origem,
            case when p_tipo = 'CONTRATO_PLANO' then null else p_momento end,
            p_exigencia, p_ator)
    returning id into v_id;

    insert into public.document_template_versions (
      tenant_id, template_id, version, source, body_markup, body_doc,
      file_path, file_sha256, file_name, file_size, file_pages,
      variables, uses_payment, created_by)
    values (p_tenant, v_id, 1, p_origem, v_markup, v_doc,
            p_arquivo_path, p_arquivo_sha256, p_arquivo_nome, p_arquivo_tamanho, p_arquivo_paginas,
            coalesce(p_variaveis, '{}'), coalesce(p_usa_pagamento, false), p_ator);

    return jsonb_build_object('id', v_id, 'versao', 1, 'novaVersao', true);
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

  -- Versão nova só quando o CONTEÚDO muda. jsonb compara pelo valor, não pela
  -- ordem das chaves; sair da marcação para o editor rico é sempre mudança.
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

  return jsonb_build_object('id', p_modelo, 'versao', v_versao, 'novaVersao', v_mudou);
end $$;

revoke execute on function public.documento_modelo_salvar(uuid, uuid, text, text, text, text, text, text, text, text, text, int, int, text[], boolean, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.documento_modelo_salvar(uuid, uuid, text, text, text, text, text, text, text, text, text, int, int, text[], boolean, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
