-- As obrigatórias conferidas DENTRO da gravação (atend-04 da revisão do
-- Heitor, 2026-11-02: "regras de negócio devem ser sempre validadas em
-- backend").
--
-- Desde 2026-10-29 a pergunta obrigatória em branco (anamnese ou ficha do
-- procedimento) barra o "Finalizar" e o gerar plano — mas quem conferia era
-- só a action (`oQueFaltaParaSeguir`). A função chamada direto, sem o app,
-- concluía. Agora `concluir_atendimento` e `gerar_plano_da_avaliacao` recusam
-- sozinhas, com a MESMA conta e a MESMA mensagem da action:
--
--  * `private.ficha_campo_vazio` = `campoVazio` (lib/anamnesis.ts);
--  * `private.ficha_campo_visivel` = `campoVisivel` (o "Quais alergias?" só no
--    "Sim" — escondido, não barra);
--  * `private.ficha_primeira_obrigatoria_vazia` = `primeiraObrigatoriaVazia`;
--  * `private.obrigatoria_que_falta` = `oQueFaltaParaSeguir`: a anamnese que a
--    gravação traz (senão a gravada), contra a ficha de pré-atendimento da
--    rede; a ficha do procedimento que a gravação traz (senão a salva), contra
--    a ficha ligada ao procedimento AGORA.
--
-- No plano da avaliação CONCLUÍDA (o registro travado), vale o que ficou
-- gravado — também conferido (a action passava direto).
--
-- As duas funções são recriadas a partir do corpo ATUAL da produção
-- (pg_get_functiondef): o bloco abaixo só insere a conferência, e recusa se o
-- corpo não tiver o trecho esperado (alguém o mudou: revisar à mão).

create or replace function private.ficha_campo_vazio(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then true
    when jsonb_typeof(v) = 'array' then jsonb_array_length(v) = 0
    when jsonb_typeof(v) = 'object' then
      case when jsonb_typeof(v -> 'points') = 'array'
           then jsonb_array_length(v -> 'points') = 0
                and coalesce(v -> 'planejamento' ->> 'id', '') = ''
           else true end
    else btrim(v #>> '{}') = ''
  end
$$;

create or replace function private.ficha_campo_visivel(f jsonb, respostas jsonb, ids text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(f -> 'mostrarSe') is distinct from 'object' then true
    when coalesce(f -> 'mostrarSe' ->> 'campo', '') = '' or coalesce(f -> 'mostrarSe' ->> 'valor', '') = '' then true
    when not ((f -> 'mostrarSe' ->> 'campo') = any (ids)) or (f -> 'mostrarSe' ->> 'campo') = (f ->> 'id') then true
    when jsonb_typeof(respostas -> (f -> 'mostrarSe' ->> 'campo')) = 'array'
      then (respostas -> (f -> 'mostrarSe' ->> 'campo')) ? btrim(f -> 'mostrarSe' ->> 'valor')
    else coalesce(respostas ->> (f -> 'mostrarSe' ->> 'campo'), '') = btrim(f -> 'mostrarSe' ->> 'valor')
  end
$$;

-- A primeira obrigatória vazia, na ordem da ficha (o rótulo), ou nulo. Aceita
-- o formato de linhas e o legado (lista plana em `fields`), como
-- `normalizeFormSchema`.
create or replace function private.ficha_primeira_obrigatoria_vazia(p_schema jsonb, p_respostas jsonb, p_ignorar text[])
returns text
language sql
immutable
set search_path = ''
as $$
  with campos as (
    select fl.value as f, r.ord as ro, fl.ord as fo
      from jsonb_array_elements(case when jsonb_typeof(p_schema -> 'rows') = 'array' then p_schema -> 'rows' else '[]'::jsonb end)
             with ordinality as r(value, ord),
           jsonb_array_elements(case when jsonb_typeof(r.value -> 'fields') = 'array' then r.value -> 'fields' else '[]'::jsonb end)
             with ordinality as fl(value, ord)
    union all
    select fl.value, fl.ord, 0
      from jsonb_array_elements(case when jsonb_typeof(p_schema -> 'rows') is distinct from 'array'
                                      and jsonb_typeof(p_schema -> 'fields') = 'array' then p_schema -> 'fields' else '[]'::jsonb end)
             with ordinality as fl(value, ord)
  ),
  ids as (select coalesce(array_agg(f ->> 'id'), '{}') as ids from campos)
  select btrim(c.f ->> 'label')
    from campos c, ids
   where c.f -> 'required' = 'true'::jsonb
     and coalesce(c.f ->> 'type', '') <> 'section'
     and not (coalesce(c.f ->> 'type', '') = any (p_ignorar))
     and coalesce(btrim(c.f ->> 'label'), '') <> ''
     and private.ficha_campo_visivel(c.f, coalesce(p_respostas, '{}'::jsonb), ids.ids)
     and private.ficha_campo_vazio(coalesce(p_respostas, '{}'::jsonb) -> (c.f ->> 'id'))
   order by c.ro, c.fo
   limit 1
$$;

-- O que falta para seguir (a mensagem da action), ou nulo.
create or replace function private.obrigatoria_que_falta(
  p_agendamento uuid, p_tenant uuid, p_anamnese jsonb, p_ficha jsonb, p_sem_injetaveis boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_proc    uuid;
  v_schema  jsonb;
  v_resp    jsonb;
  v_ga      jsonb;
  v_rotulo  text;
begin
  select a.client_id, a.procedure_id into v_cliente, v_proc
    from public.appointments a where a.id = p_agendamento;

  if v_cliente is not null then
    select f.schema into v_schema
      from public.forms f where f.tenant_id = p_tenant and f.tipo = 'PRE_ATENDIMENTO' limit 1;
    if v_schema is not null then
      if jsonb_typeof(p_anamnese) = 'object' and jsonb_typeof(p_anamnese -> 'respostas') = 'object' then
        v_resp := p_anamnese -> 'respostas';
      else
        select mr.general_anamnesis into v_ga from public.medical_records mr where mr.client_id = v_cliente;
        v_resp := case
          when jsonb_typeof(v_ga) = 'object' and v_ga ->> 'versao' = '2' then coalesce(v_ga -> 'respostas', '{}'::jsonb)
          when jsonb_typeof(v_ga) = 'object' then v_ga
          else '{}'::jsonb end;
      end if;
      v_rotulo := private.ficha_primeira_obrigatoria_vazia(v_schema, v_resp, array['section', 'photo', 'injectable_map']);
      if v_rotulo is not null then
        return format('Falta responder "%s" na anamnese.', v_rotulo);
      end if;
    end if;
  end if;

  if v_proc is not null then
    v_schema := null;
    select f.schema into v_schema
      from public.procedures p
      join public.forms f on f.id = p.form_id and f.tenant_id = p_tenant and f.tipo = 'PROCEDIMENTO'
     where p.id = v_proc and p.tenant_id = p_tenant;
    if v_schema is not null then
      if jsonb_typeof(p_ficha) = 'object' and jsonb_typeof(p_ficha -> 'answers') = 'object' then
        v_resp := p_ficha -> 'answers';
      else
        select e.form_data -> 'ficha' -> 'answers' into v_resp
          from public.medical_record_entries e where e.appointment_id = p_agendamento;
        if jsonb_typeof(v_resp) is distinct from 'object' then v_resp := '{}'::jsonb; end if;
      end if;
      v_rotulo := private.ficha_primeira_obrigatoria_vazia(v_schema, v_resp,
        case when p_sem_injetaveis then array['section', 'injectable_map'] else array['section'] end);
      if v_rotulo is not null then
        return format('Falta preencher "%s" na ficha do procedimento.', v_rotulo);
      end if;
    end if;
  end if;
  return null;
end
$$;

revoke execute on function private.obrigatoria_que_falta(uuid, uuid, jsonb, jsonb, boolean) from public, anon, authenticated;

-- ─── As duas gravações passam a conferir ────────────────────────────────────

do $$
declare
  v_def  text;
  v_novo text;
begin
  -- concluir_atendimento: antes de marcar COMPLETED.
  v_def := pg_get_functiondef('public.concluir_atendimento(uuid,uuid,uuid,text,jsonb)'::regprocedure);
  if position('obrigatoria_que_falta' in v_def) = 0 then
    v_novo := replace(v_def,
      E'  v_ficha      jsonb := case',
      E'  v_falta      text;\n  v_ficha      jsonb := case');
    v_novo := replace(v_novo,
      E'  update public.appointments\n  set status = ''COMPLETED'', completed_at = now()\n  where id = p_agendamento;',
      E'  -- A obrigatória em branco barra também aqui (atend-04): a action confere\n'
      || E'  -- antes, mas um caminho que não passe por ela não conclui.\n'
      || E'  v_falta := private.obrigatoria_que_falta(p_agendamento, p_tenant, v_anamnese, v_ficha,\n'
      || E'    coalesce((p_dados ->> ''sem_injetaveis'')::boolean, false));\n'
      || E'  if v_falta is not null then\n'
      || E'    raise exception ''%'', v_falta using errcode = ''check_violation'';\n'
      || E'  end if;\n\n'
      || E'  update public.appointments\n  set status = ''COMPLETED'', completed_at = now()\n  where id = p_agendamento;');
    if v_novo = v_def or position('obrigatoria_que_falta' in v_novo) = 0 or position('v_falta      text;' in v_novo) = 0 then
      raise exception 'concluir_atendimento mudou: insira a conferência à mão';
    end if;
    execute v_novo;
  end if;

  -- gerar_plano_da_avaliacao: depois de saber se o registro está travado.
  v_def := pg_get_functiondef('public.gerar_plano_da_avaliacao(uuid,uuid,uuid,text,jsonb)'::regprocedure);
  if position('obrigatoria_que_falta' in v_def) = 0 then
    v_novo := replace(v_def,
      E'  v_ficha        jsonb := case',
      E'  v_falta        text;\n  v_ficha        jsonb := case');
    v_novo := replace(v_novo,
      E'  v_registro := v_status <> ''COMPLETED'';',
      E'  v_registro := v_status <> ''COMPLETED'';\n\n'
      || E'  -- A obrigatória em branco barra o plano (atend-04). Na avaliação concluída\n'
      || E'  -- (registro travado) vale o que ficou gravado.\n'
      || E'  v_falta := private.obrigatoria_que_falta(p_agendamento, p_tenant,\n'
      || E'    case when v_registro then v_anamnese end, case when v_registro then v_ficha end,\n'
      || E'    coalesce((p_dados ->> ''sem_injetaveis'')::boolean, false));\n'
      || E'  if v_falta is not null then\n'
      || E'    raise exception ''%'', v_falta using errcode = ''check_violation'';\n'
      || E'  end if;');
    if v_novo = v_def or position('obrigatoria_que_falta' in v_novo) = 0 or position('v_falta        text;' in v_novo) = 0 then
      raise exception 'gerar_plano_da_avaliacao mudou: insira a conferência à mão';
    end if;
    execute v_novo;
  end if;
end $$;

notify pgrst, 'reload schema';
