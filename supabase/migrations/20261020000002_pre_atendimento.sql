-- O pré-atendimento (2026-10-20, decisões do Heitor). Etapa 1: o banco.
--
-- UMA ficha por rede com as perguntas sobre a PESSOA (alergias, medicamentos,
-- gestação…), editável no mesmo construtor das fichas, com o envio ligado ou
-- não pela rede, mandada ao AGENDAR, com validade (padrão 6 meses: dentro
-- dela, só "algo mudou?"). Substitui a anamnese geral de campos fixos
-- (`medical_records.general_anamnesis`).
--
--  • `forms.tipo`: PROCEDIMENTO (a de sempre) ou PRE_ATENDIMENTO (uma por rede).
--    A da rede nasce com as perguntas da anamnese de hoje — os MESMOS ids
--    (skinType, allergies…), para as respostas antigas virarem respostas dela.
--  • `tenants.pre_atendimento_envio` (nasce DESLIGADO: nada sai para a cliente
--    sem a clínica ligar) e `pre_atendimento_validade_meses` (6).
--  • `pre_atendimentos`: o envio — um PENDENTE por cliente, o retrato das
--    perguntas do momento, e depois as respostas. Dado CLÍNICO: só o servidor.
--  • O pendente nasce por GATILHO no agendamento, como os termos: são oito
--    caminhos de agendar, e três não passam pelo núcleo do app.
--  • `anamnese_do_legado`: a anamnese de campos fixos → o formato novo. A
--    conversão dos dados roda na etapa 2, junto com o código que lê o novo.

-- ─── A ficha da rede ─────────────────────────────────────────────────────────

alter table public.forms add column if not exists tipo text not null default 'PROCEDIMENTO';
alter table public.forms add constraint forms_tipo_valido check (tipo in ('PROCEDIMENTO', 'PRE_ATENDIMENTO'));
create unique index if not exists forms_um_pre_atendimento_por_rede
  on public.forms (tenant_id) where tipo = 'PRE_ATENDIMENTO';

-- As perguntas da anamnese de hoje, com os mesmos ids e rótulos.
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

insert into public.forms (tenant_id, name, schema, is_active, tipo)
select t.id, 'Pré-atendimento', private.ficha_de_pre_atendimento_padrao(), true, 'PRE_ATENDIMENTO'
  from public.tenants t
 where not exists (select 1 from public.forms f where f.tenant_id = t.id and f.tipo = 'PRE_ATENDIMENTO');

-- Toda rede nova nasce com a dela (o cadastro público e o "Nova rede" do sistema).
create or replace function private.trg_rede_nasce_com_pre_atendimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.forms (tenant_id, name, schema, is_active, tipo)
  values (new.id, 'Pré-atendimento', private.ficha_de_pre_atendimento_padrao(), true, 'PRE_ATENDIMENTO')
  on conflict do nothing;
  return new;
end $$;

create trigger trg_rede_nasce_com_pre_atendimento
  after insert on public.tenants
  for each row execute function private.trg_rede_nasce_com_pre_atendimento();

-- A ficha de procedimento é só a de procedimento.
create or replace function private.trg_procedimento_ficha_do_tipo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.form_id is not null and exists (
    select 1 from public.forms f where f.id = new.form_id and f.tipo <> 'PROCEDIMENTO'
  ) then
    raise exception using errcode = 'P0001', message = 'A ficha de pré-atendimento não é ficha de procedimento.';
  end if;
  return new;
end $$;

create trigger trg_procedimento_ficha_do_tipo
  before insert or update of form_id on public.procedures
  for each row execute function private.trg_procedimento_ficha_do_tipo();

-- ─── A escolha da rede ───────────────────────────────────────────────────────

alter table public.tenants add column if not exists pre_atendimento_envio boolean not null default false;
alter table public.tenants add column if not exists pre_atendimento_validade_meses int not null default 6;
alter table public.tenants add constraint tenants_pre_atendimento_validade
  check (pre_atendimento_validade_meses between 1 and 36);

-- ─── O envio ─────────────────────────────────────────────────────────────────

create table if not exists public.pre_atendimentos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  status         text not null default 'PENDENTE' check (status in ('PENDENTE', 'RESPONDIDO', 'CANCELADO')),
  -- COMPLETO = a ficha inteira; CONFIRMAR = dentro da validade, "algo mudou?".
  modo           text not null check (modo in ('COMPLETO', 'CONFIRMAR')),
  -- O retrato das perguntas no momento do envio: { formId, nome, rows }.
  ficha          jsonb not null,
  respostas      jsonb,
  respondido_em  timestamptz,
  origem         text check (origem in ('CLIENTE_APP', 'CLIENTE_LINK', 'EQUIPE')),
  respondido_por uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists pre_atendimentos_cliente on public.pre_atendimentos (client_id, created_at desc);
create index if not exists pre_atendimentos_agendamento on public.pre_atendimentos (appointment_id);
-- Um pendente por cliente: dois agendamentos juntos não abrem dois.
create unique index if not exists pre_atendimentos_um_pendente
  on public.pre_atendimentos (client_id) where status = 'PENDENTE';

-- Dado clínico, escrito pela cliente e pela equipe SÓ pelo servidor: RLS
-- ligada e nenhuma política permissiva. As restritivas do suporte, à mão (o
-- laço de 20261008000010 rodou uma vez, sobre as tabelas de então).
alter table public.pre_atendimentos enable row level security;
create policy suporte_sem_clinico on public.pre_atendimentos as restrictive for all
  using (not private.suporte_sem_clinico()) with check (not private.suporte_sem_clinico());
create policy suporte_sem_escrita_ins on public.pre_atendimentos as restrictive for insert
  with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_upd on public.pre_atendimentos as restrictive for update
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end) with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);
create policy suporte_sem_escrita_del on public.pre_atendimentos as restrictive for delete
  using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true else not private.suporte_sem_escrita() end);

-- O pendente nasce no agendamento — qualquer caminho.
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

  -- A última resposta: a do formato novo, ou a data da anamnese antiga.
  select coalesce(nullif(mr.general_anamnesis ->> 'respondidoEm', ''), nullif(mr.general_anamnesis ->> 'updatedAt', ''))::timestamptz
    into v_ultima
    from public.medical_records mr where mr.client_id = new.client_id;

  insert into public.pre_atendimentos (tenant_id, client_id, appointment_id, modo, ficha)
  values (
    v_tenant, new.client_id, new.id,
    case when v_ultima is not null and v_ultima > now() - make_interval(months => v_validade) then 'CONFIRMAR' else 'COMPLETO' end,
    jsonb_build_object('formId', v_ficha_id, 'nome', v_nome, 'rows', coalesce(v_esquema -> 'rows', '[]'::jsonb))
  )
  on conflict do nothing;
  return new;
end $$;

create trigger trg_pre_atendimento_no_agendamento
  after insert on public.appointments
  for each row execute function private.pre_atendimento_no_agendamento();

-- ─── A anamnese de campos fixos → o formato novo ─────────────────────────────
-- { versao: 2, ficha: { formId, nome, rows }, respostas, respondidoEm, origem, respondidoPor }

create or replace function public.anamnese_do_legado(p_legado jsonb, p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ficha_id uuid;
  v_nome     text;
  v_esquema  jsonb;
  v_pele     text;
  v_sim_nao  constant jsonb := '{"true": "Sim", "false": "Não"}';
begin
  if p_legado is null or (p_legado ? 'versao') then return p_legado; end if;
  select f.id, f.name, f.schema into v_ficha_id, v_nome, v_esquema
    from public.forms f where f.tenant_id = p_tenant and f.tipo = 'PRE_ATENDIMENTO';
  v_esquema := coalesce(v_esquema, private.ficha_de_pre_atendimento_padrao());
  v_pele := case lower(coalesce(p_legado ->> 'skinType', ''))
    when 'normal' then 'Normal' when 'seca' then 'Seca' when 'oleosa' then 'Oleosa'
    when 'mista' then 'Mista' when 'sensivel' then 'Sensível' else '' end;

  return jsonb_build_object(
    'versao', 2,
    'ficha', jsonb_build_object('formId', v_ficha_id, 'nome', coalesce(v_nome, 'Pré-atendimento'), 'rows', v_esquema -> 'rows'),
    'respostas', jsonb_strip_nulls(jsonb_build_object(
      'skinType', nullif(v_pele, ''),
      'allergies', nullif(p_legado ->> 'allergies', ''),
      'medications', nullif(p_legado ->> 'medications', ''),
      'healthConditions', nullif(p_legado ->> 'healthConditions', ''),
      'previousProcedures', nullif(p_legado ->> 'previousProcedures', ''),
      'isPregnantOrBreastfeeding', v_sim_nao ->> coalesce(p_legado ->> 'isPregnantOrBreastfeeding', 'false'),
      'useSunscreen', v_sim_nao ->> coalesce(p_legado ->> 'useSunscreen', 'false'),
      'observations', nullif(p_legado ->> 'observations', '')
    )),
    'respondidoEm', p_legado ->> 'updatedAt',
    'origem', 'LEGADO',
    'respondidoPor', p_legado ->> 'updatedBy'
  );
end $$;

revoke execute on function public.anamnese_do_legado(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.anamnese_do_legado(jsonb, uuid) to service_role;

notify pgrst, 'reload schema';
