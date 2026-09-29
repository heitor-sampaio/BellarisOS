-- Termos e contratos — fase 1: os MODELOS da rede.
--
-- A rede monta (no editor, com variáveis) ou envia (um PDF pronto) os modelos
-- de termo de consentimento e de contrato, e liga a cada procedimento até UM
-- termo e UM contrato. O contrato de PLANO é da rede: um só ativo, e ele lista
-- todos os procedimentos, as sessões, o valor e a forma de pagamento
-- (decisões do Heitor, 2026-09-29).
--
-- Editar um modelo não muda o que já foi emitido: cada mudança de CONTEÚDO
-- gera uma VERSÃO nova e imutável, e o documento emitido (fase 2) aponta para
-- a versão que usou — como o voucher guarda o retrato da recompensa.
--
-- Modelo não se apaga: documento emitido aponta para ele. O que não serve
-- mais é desativado.

-- ─── Modelos ─────────────────────────────────────────────────────────────────
create table public.document_templates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id),
  name            text not null check (length(trim(name)) >= 2),
  -- TERMO e CONTRATO se ligam ao procedimento; CONTRATO_PLANO é o da rede.
  kind            text not null check (kind in ('TERMO', 'CONTRATO', 'CONTRATO_PLANO')),
  -- EDITOR: texto com variáveis. ARQUIVO: PDF enviado, assinado como está.
  source          text not null check (source in ('EDITOR', 'ARQUIVO')),
  -- Quando nasce no atendimento avulso. No plano é sempre no fechamento, por
  -- isso o contrato de plano não tem momento.
  moment          text check (moment in ('AGENDAMENTO', 'INICIO_ATENDIMENTO')),
  enforcement     text not null default 'BLOQUEIA' check (enforcement in ('BLOQUEIA', 'AVISA')),
  is_active       boolean not null default true,
  current_version int not null default 1 check (current_version >= 1),
  -- Modelos que o sistema semeia (o contrato de plano padrão, fase 3).
  system_key      text,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint document_templates_momento_do_tipo check (
    (kind = 'CONTRATO_PLANO' and moment is null) or
    (kind <> 'CONTRATO_PLANO' and moment is not null)
  ),
  -- Alvo das chaves compostas: o procedimento só aponta para modelo da MESMA rede.
  constraint document_templates_id_tenant_key unique (id, tenant_id)
);
create index idx_document_templates_rede on public.document_templates (tenant_id, kind, is_active);
-- No máximo UM contrato de plano ativo por rede — é índice, não disciplina do
-- app: com dois, "qual contrato o plano usa" viraria desempate silencioso.
create unique index uniq_contrato_de_plano_ativo on public.document_templates (tenant_id)
  where kind = 'CONTRATO_PLANO' and is_active;
create unique index uniq_document_templates_system_key on public.document_templates (tenant_id, system_key)
  where system_key is not null;

-- ─── Versões (imutáveis) ─────────────────────────────────────────────────────
create table public.document_template_versions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  template_id   uuid not null,
  version       int  not null check (version >= 1),
  source        text not null check (source in ('EDITOR', 'ARQUIVO')),
  body_markup   text,
  file_path     text,
  file_sha256   text,
  file_name     text,
  file_size     int,
  file_pages    int,
  -- Calculados pelo app ao salvar (lib/documentos/variaveis.ts).
  variables     text[] not null default '{}',
  uses_payment  boolean not null default false,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  constraint document_template_versions_modelo_fkey
    foreign key (template_id, tenant_id) references public.document_templates(id, tenant_id),
  constraint document_template_versions_numero unique (template_id, version),
  constraint document_template_versions_conteudo check (
    (source = 'EDITOR'  and body_markup is not null and file_path is null) or
    (source = 'ARQUIVO' and file_path is not null and file_sha256 is not null and body_markup is null)
  )
);

-- Versão é retrato: o documento assinado prova o que foi assinado apontando
-- para ela. Mudar uma versão mudaria, depois, o que alguém assinou. Apagar a
-- que um documento usa é barrado pela chave estrangeira dele (fase 2); a que
-- ninguém usa pode sair (é o que a limpeza dos testes faz).
create or replace function private.versao_de_modelo_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Versão de modelo de documento não se altera — edite o modelo, que abre uma versão nova.' using errcode = 'P0001';
end $$;

create trigger trg_versao_de_modelo_imutavel
  before update on public.document_template_versions
  for each row execute function private.versao_de_modelo_imutavel();

-- ─── Procedimento → termo e contrato ─────────────────────────────────────────
alter table public.procedures
  add column consent_template_id  uuid,
  add column contract_template_id uuid,
  -- Chave composta com tenant_id: o banco recusa modelo de outra rede.
  add constraint procedures_consent_template_fkey
    foreign key (consent_template_id, tenant_id) references public.document_templates(id, tenant_id),
  add constraint procedures_contract_template_fkey
    foreign key (contract_template_id, tenant_id) references public.document_templates(id, tenant_id);

-- O tipo certo em cada campo: termo no termo, contrato no contrato. O contrato
-- de plano não se liga a procedimento — ele é da rede.
create or replace function private.procedimento_modelos_do_tipo()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_tipo text;
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
  return new;
end $$;

create trigger trg_procedimento_modelos_do_tipo
  before insert or update of consent_template_id, contract_template_id on public.procedures
  for each row execute function private.procedimento_modelos_do_tipo();

-- ─── Salvar um modelo: o modelo e a versão numa transação ────────────────────
--
-- O app valida o texto e calcula as variáveis; esta função grava. Criar:
-- modelo + versão 1. Editar: atualiza nome, momento e exigência, e só abre uma
-- versão nova quando o CONTEÚDO mudou (texto, ou o hash do arquivo). O tipo e a
-- origem não mudam depois de criado — mudariam o sentido do que já foi emitido.
create or replace function public.documento_modelo_salvar(
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
  p_ator             uuid
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
begin
  if p_modelo is null then
    insert into public.document_templates (tenant_id, name, kind, source, moment, enforcement, created_by)
    values (p_tenant, trim(p_nome), p_tipo, p_origem,
            case when p_tipo = 'CONTRATO_PLANO' then null else p_momento end,
            p_exigencia, p_ator)
    returning id into v_id;

    insert into public.document_template_versions (
      tenant_id, template_id, version, source, body_markup,
      file_path, file_sha256, file_name, file_size, file_pages,
      variables, uses_payment, created_by)
    values (p_tenant, v_id, 1, p_origem,
            case when p_origem = 'EDITOR' then p_texto end,
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

  v_mudou := case
    when p_origem = 'EDITOR'  then p_texto is not null and p_texto is distinct from v_atual.body_markup
    else p_arquivo_sha256 is not null and p_arquivo_sha256 is distinct from v_atual.file_sha256
  end;

  v_versao := v_modelo.current_version;
  if v_mudou then
    v_versao := v_versao + 1;
    insert into public.document_template_versions (
      tenant_id, template_id, version, source, body_markup,
      file_path, file_sha256, file_name, file_size, file_pages,
      variables, uses_payment, created_by)
    values (p_tenant, p_modelo, v_versao, p_origem,
            case when p_origem = 'EDITOR' then p_texto end,
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

revoke execute on function public.documento_modelo_salvar(uuid, uuid, text, text, text, text, text, text, text, text, text, int, int, text[], boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.documento_modelo_salvar(uuid, uuid, text, text, text, text, text, text, text, text, text, int, int, text[], boolean, uuid)
  to service_role;

-- ─── RLS: só leitura, e só a equipe da própria rede ──────────────────────────
-- Quem grava é o servidor (actions + a função acima). O cliente final não lê
-- modelo nenhum: ele vê o documento EMITIDO para ele (fase 2).
alter table public.document_templates         enable row level security;
alter table public.document_template_versions enable row level security;

create policy "document_templates_select" on public.document_templates for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

create policy "document_template_versions_select" on public.document_template_versions for select
  using (public.jwt_claim('role') <> 'CLIENT' and tenant_id = (public.jwt_claim('tenant_id'))::uuid);

-- ─── Permissão: módulo `documents` ───────────────────────────────────────────
-- Colher assinatura era parte do checkout (Prontuário ou recebimento). Ninguém
-- perde o que já fazia: MANAGE para quem gerencia clientes, prontuário,
-- recebimentos ou financeiro; VIEW para quem só vê clientes ou prontuário.
insert into public.role_permissions (tenant_id, role_id, module, level, scope)
select rp.tenant_id, rp.role_id, 'documents',
       case when bool_or(rp.level = 'MANAGE' and rp.module in ('clients', 'medical_records', 'cashier', 'financial'))
            then 'MANAGE'::public.permission_level
            else 'VIEW'::public.permission_level end,
       'ALL'::public.permission_scope
  from public.role_permissions rp
 where rp.module in ('clients', 'medical_records', 'cashier', 'financial')
   and rp.level <> 'NONE'
 group by rp.tenant_id, rp.role_id
having bool_or(rp.level = 'MANAGE' and rp.module in ('clients', 'medical_records', 'cashier', 'financial'))
    or bool_or(rp.module in ('clients', 'medical_records'))
on conflict (role_id, module) do nothing;

notify pgrst, 'reload schema';
