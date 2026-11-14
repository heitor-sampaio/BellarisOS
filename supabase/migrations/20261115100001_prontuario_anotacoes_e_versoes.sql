-- Bloco Prontuário do plano de adaptação (a revisão do Heitor, 2026-11-13).
--
-- PR1a — o momento da foto do atendimento (antes, durante, depois) passa a
--   ser gravado: `client_documents.momento`. Era só o nome sugerido ("Foto
--   clínica (antes) — …"), e a aba Prontuário não tinha como dizê-lo.
-- PR2a — a ANOTAÇÃO depois do atendimento (`prontuario_anotacoes`): um texto
--   datado, com quem escreveu (o nome do ctx, com a marca "via suporte"), que
--   não se edita nem se apaga.
-- PR2b — a VERSÃO de antes da correção (`prontuario_versoes`): o "Editar
--   registro" do atendimento concluído guarda o que estava (evolução,
--   intercorrência, ficha do procedimento), com quem e quando, antes de
--   trocar — numa transação só, `prontuario_corrigir_registro`.
-- PR3 — "Ficha de saúde" nas três mensagens do banco que chegam à tela.
--
-- As duas tabelas: só o servidor lê e grava (RLS ligada, nenhuma política
-- permissiva — como `prontuario_acessos`), com as restritivas do suporte, e
-- um gatilho que recusa UPDATE e DELETE. O DELETE passa só em cascata (o pai
-- apagado — o produto não apaga atendimento nem cliente) e na limpeza das
-- redes de TESTE (`e2e_apagar_rede`, que marca a rede que está apagando).
-- Nenhuma chave estrangeira entra na chave primária (PGRST201).

-- ─── PR1a: o momento da foto ────────────────────────────────────────────────
alter table public.client_documents
  add column if not exists momento text check (momento in ('ANTES', 'DURANTE', 'DEPOIS'));

-- ─── PR2a: as anotações ─────────────────────────────────────────────────────
create table if not exists public.prontuario_anotacoes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  texto          text not null check (length(btrim(texto)) > 0),
  -- Sem chave estrangeira de propósito: a anotação sobrevive ao membro (o
  -- nome fica em autor_nome, como estava na hora).
  autor_id       uuid,
  autor_nome     text not null,
  criada_em      timestamptz not null default now()
);
create index if not exists prontuario_anotacoes_atendimento on public.prontuario_anotacoes (appointment_id, criada_em);
create index if not exists prontuario_anotacoes_cliente on public.prontuario_anotacoes (client_id, criada_em);

-- ─── PR2b: as versões de antes ──────────────────────────────────────────────
create table if not exists public.prontuario_versoes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  client_id        uuid not null references public.clients(id) on delete cascade,
  appointment_id   uuid not null references public.appointments(id) on delete cascade,
  -- O que ESTAVA antes da correção.
  evolucao         text,
  intercorrencias  text,
  ficha            jsonb,
  -- Quem corrigiu (e assim tirou esta versão do ar) e quando.
  editada_por      uuid,
  editada_por_nome text not null,
  substituida_em   timestamptz not null default now()
);
create index if not exists prontuario_versoes_atendimento on public.prontuario_versoes (appointment_id, substituida_em);
create index if not exists prontuario_versoes_cliente on public.prontuario_versoes (client_id, substituida_em);

-- Só o servidor lê e grava; o suporte nem lê (clínico) nem grava.
do $$
declare t text;
begin
  foreach t in array array['prontuario_anotacoes', 'prontuario_versoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists suporte_sem_escrita_ins on public.%I', t);
    execute format('drop policy if exists suporte_sem_escrita_upd on public.%I', t);
    execute format('drop policy if exists suporte_sem_escrita_del on public.%I', t);
    execute format('drop policy if exists suporte_sem_clinico on public.%I', t);
    execute format($p$create policy suporte_sem_escrita_ins on public.%I as restrictive for insert
      with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                       else not private.suporte_sem_escrita() end)$p$, t);
    execute format($p$create policy suporte_sem_escrita_upd on public.%I as restrictive for update
      using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                  else not private.suporte_sem_escrita() end)
      with check (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                       else not private.suporte_sem_escrita() end)$p$, t);
    execute format($p$create policy suporte_sem_escrita_del on public.%I as restrictive for delete
      using (case when nullif(nullif(auth.jwt() ->> 'session_id', ''), 'null') is null then true
                  else not private.suporte_sem_escrita() end)$p$, t);
    execute format($p$create policy suporte_sem_clinico on public.%I as restrictive for all
      using (not private.suporte_sem_clinico()) with check (not private.suporte_sem_clinico())$p$, t);
  end loop;
end $$;

-- Uma anotação e uma versão não se alteram nem se apagam (como os acessos).
create or replace function private.prontuario_registro_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and (
       pg_trigger_depth() > 1                                                -- a cascata do pai
       or current_setting('bellaris.apagando_rede', true) = old.tenant_id::text  -- a limpeza da rede de teste
     ) then
    return old;
  end if;
  if tg_table_name = 'prontuario_anotacoes' then
    raise exception 'A anotação do prontuário não se altera nem se apaga.' using errcode = 'check_violation';
  end if;
  raise exception 'A versão do prontuário não se altera nem se apaga.' using errcode = 'check_violation';
end $$;

drop trigger if exists trg_prontuario_anotacoes_imutavel on public.prontuario_anotacoes;
create trigger trg_prontuario_anotacoes_imutavel
  before update or delete on public.prontuario_anotacoes
  for each row execute function private.prontuario_registro_imutavel();
drop trigger if exists trg_prontuario_versoes_imutavel on public.prontuario_versoes;
create trigger trg_prontuario_versoes_imutavel
  before update or delete on public.prontuario_versoes
  for each row execute function private.prontuario_registro_imutavel();

-- ─── PR2b: a correção, numa transação ───────────────────────────────────────
-- `p_campos` traz SÓ o que a correção muda: 'notes', 'intercurrences' e/ou
-- 'ficha' (a `form_data.ficha` inteira, já retratada pelo servidor). Muda
-- alguma coisa → a versão de antes é gravada e a entrada, trocada. Igual →
-- nada se grava. A entrada travada (`for update`): duas correções juntas viram
-- duas versões em fila, nenhuma se perde.
create or replace function public.prontuario_corrigir_registro(
  p_tenant uuid, p_agendamento uuid, p_campos jsonb, p_autor uuid, p_autor_nome text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cliente      uuid;
  v_profissional uuid;
  v_status       text;
  v_prontuario   uuid;
  v_entrada      public.medical_record_entries%rowtype;
  v_notas        text;
  v_interc       text;
  v_form         jsonb;
begin
  select a.client_id, a.professional_id, a.status::text into v_cliente, v_profissional, v_status
    from public.appointments a join public.branches b on b.id = a.branch_id
   where a.id = p_agendamento and b.tenant_id = p_tenant;
  if v_cliente is null then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_status <> 'COMPLETED' then
    raise exception 'Só se corrige o registro do atendimento concluído.' using errcode = 'check_violation';
  end if;

  select mr.id into v_prontuario from public.medical_records mr where mr.client_id = v_cliente;
  if v_prontuario is null then
    insert into public.medical_records (client_id) values (v_cliente) returning id into v_prontuario;
  end if;

  select * into v_entrada from public.medical_record_entries e where e.appointment_id = p_agendamento for update;
  if not found then
    -- Nada escrito antes: não há versão a guardar.
    insert into public.medical_record_entries (medical_record_id, appointment_id, professional_id, notes, intercurrences, form_data)
    values (v_prontuario, p_agendamento, v_profissional,
            nullif(p_campos ->> 'notes', ''), nullif(p_campos ->> 'intercurrences', ''),
            case when p_campos ? 'ficha' then jsonb_build_object('ficha', p_campos -> 'ficha') end);
    return jsonb_build_object('versao', false);
  end if;

  v_notas  := case when p_campos ? 'notes' then nullif(p_campos ->> 'notes', '') else v_entrada.notes end;
  v_interc := case when p_campos ? 'intercurrences' then nullif(p_campos ->> 'intercurrences', '') else v_entrada.intercurrences end;
  v_form   := case when p_campos ? 'ficha'
                then coalesce(v_entrada.form_data, '{}'::jsonb) || jsonb_build_object('ficha', p_campos -> 'ficha')
                else v_entrada.form_data end;

  if v_notas is not distinct from v_entrada.notes
     and v_interc is not distinct from v_entrada.intercurrences
     and (v_form -> 'ficha') is not distinct from (v_entrada.form_data -> 'ficha') then
    return jsonb_build_object('versao', false);
  end if;

  insert into public.prontuario_versoes (tenant_id, client_id, appointment_id, evolucao, intercorrencias, ficha, editada_por, editada_por_nome)
  values (p_tenant, v_cliente, p_agendamento, v_entrada.notes, v_entrada.intercurrences, v_entrada.form_data -> 'ficha',
          p_autor, coalesce(nullif(p_autor_nome, ''), 'Alguém da equipe'));

  update public.medical_record_entries
     set notes = v_notas, intercurrences = v_interc, form_data = v_form
   where id = v_entrada.id;

  return jsonb_build_object('versao', true);
end $$;

revoke execute on function public.prontuario_corrigir_registro(uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.prontuario_corrigir_registro(uuid, uuid, jsonb, uuid, text) to service_role;

-- ─── A limpeza da rede de teste marca a rede que está apagando ──────────────
-- (o gatilho de cima deixa sair a anotação e a versão dela). Do corpo de
-- PRODUÇÃO, com uma linha a mais.
do $$
declare v_def text; v_nova text;
begin
  v_def := pg_get_functiondef('public.e2e_apagar_rede(uuid)'::regprocedure);
  if position('bellaris.apagando_rede' in v_def) = 0 then
    v_nova := replace(v_def,
      '  -- As tabelas de public, com a chave primária e se têm tenant_id.',
      E'  -- A anotação e a versão do prontuário só se apagam com a rede de teste (20261115100001).\n'
      || E'  perform set_config(''bellaris.apagando_rede'', p_tenant::text, true);\n\n'
      || '  -- As tabelas de public, com a chave primária e se têm tenant_id.');
    if v_nova = v_def then raise exception 'e2e_apagar_rede: o ponto de inserção mudou'; end if;
    execute v_nova;
  end if;
end $$;

-- ─── PR3: "Ficha de saúde" nas mensagens do banco que chegam à tela ─────────
do $$
declare v_def text; v_nova text;
begin
  v_def := pg_get_functiondef('public.pre_atendimento_abrir_manual(uuid, uuid)'::regprocedure);
  v_nova := replace(v_def, 'A clínica não tem ficha de pré-atendimento ativa.', 'A rede não tem ficha de saúde ativa.');
  if v_nova <> v_def then execute v_nova; end if;

  v_def := pg_get_functiondef('private.obrigatoria_que_falta(uuid, uuid, jsonb, jsonb, boolean)'::regprocedure);
  v_nova := replace(v_def, 'na anamnese.', 'na ficha de saúde.');
  if v_nova <> v_def then execute v_nova; end if;

  v_def := pg_get_functiondef('private.trg_procedimento_ficha_do_tipo()'::regprocedure);
  v_nova := replace(v_def, 'A ficha de pré-atendimento não é ficha de procedimento.', 'A ficha de saúde não é ficha de atendimento do procedimento.');
  if v_nova <> v_def then execute v_nova; end if;
end $$;

notify pgrst, 'reload schema';
