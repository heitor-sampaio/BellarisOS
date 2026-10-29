-- "Não se aplica" na gestação (revisão do Heitor do D2, 2026-10-29).
--
-- A pergunta "Grávida ou amamentando?" da ficha de saúde padrão é obrigatória
-- desde o D2 de 2026-10-28 (20261028000301), e o cliente do sexo masculino
-- era obrigado a responder "Sim" ou "Não". Ela passa a ter "Sim", "Não" e
-- "Não se aplica", e continua obrigatória.
--
--  1. A ficha que nasce com a rede (`private.ficha_de_pre_atendimento_padrao`,
--     chamada por `trg_rede_nasce_com_pre_atendimento`) ganha a opção.
--  2. Nas redes que já existem, só a ficha padrão NUNCA editada (igual à
--     semente de 2026-10-28, campo a campo — o critério da 20261028000301)
--     muda. A ficha que a rede mexeu é dela: não se toca. Contadas antes de
--     aplicar (2026-10-29): [sim] Clínica Íris, [sim] Clínica Lótus,
--     AgapeFlow e Bellaris Clinic, mais as `[e2e]` de rodada; a [sim]
--     Clínica Aurora editou a sua e fica como está.
--  3. As respostas guardadas não mudam: cada uma leva o retrato da ficha de
--     quando foi respondida (`versao: 2, ficha: {...}`).
--
-- O corpo da semente é o da produção (igual ao da 20261028000301), mudando só
-- as opções da gestação.

-- ─── 1. A semente ───────────────────────────────────────────────────────────

-- O corpo de antes, guardado para reconhecer a ficha nunca editada.
create or replace function private.ficha_de_pre_atendimento_padrao_2026_10_28()
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
        'options', jsonb_build_array('Sim', 'Não'), 'required', true))),
    jsonb_build_object('id', 'linha-2', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'allergies', 'type', 'textarea', 'label', 'Alergias', 'required', true),
      jsonb_build_object('id', 'medications', 'type', 'textarea', 'label', 'Medicamentos em uso', 'required', true))),
    jsonb_build_object('id', 'linha-3', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'healthConditions', 'type', 'textarea', 'label', 'Condições de saúde', 'required', true),
      jsonb_build_object('id', 'previousProcedures', 'type', 'textarea', 'label', 'Procedimentos estéticos anteriores'))),
    jsonb_build_object('id', 'linha-4', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'observations', 'type', 'textarea', 'label', 'Observações gerais')))
  ))
$$;

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
        'options', jsonb_build_array('Sim', 'Não', 'Não se aplica'), 'required', true))),
    jsonb_build_object('id', 'linha-2', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'allergies', 'type', 'textarea', 'label', 'Alergias', 'required', true),
      jsonb_build_object('id', 'medications', 'type', 'textarea', 'label', 'Medicamentos em uso', 'required', true))),
    jsonb_build_object('id', 'linha-3', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'healthConditions', 'type', 'textarea', 'label', 'Condições de saúde', 'required', true),
      jsonb_build_object('id', 'previousProcedures', 'type', 'textarea', 'label', 'Procedimentos estéticos anteriores'))),
    jsonb_build_object('id', 'linha-4', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'observations', 'type', 'textarea', 'label', 'Observações gerais')))
  ))
$$;

-- ─── 2. As fichas nunca editadas ────────────────────────────────────────────

update public.forms f
   set schema = private.ficha_de_pre_atendimento_padrao(), updated_at = now()
 where f.tipo = 'PRE_ATENDIMENTO'
   and f.schema = private.ficha_de_pre_atendimento_padrao_2026_10_28();

drop function private.ficha_de_pre_atendimento_padrao_2026_10_28();

notify pgrst, 'reload schema';
