-- A alergia é Sim/Não (atend-15 da revisão do Heitor, 2026-11-02).
--
-- O Heitor: "vamos precisar de uma avaliação de uma IA para entender o que
-- foi escrito e isso não está no escopo; alergia: opção de sim ou não; se
-- sim, campo texto livre para detalhamento e alerta". Até aqui a pergunta
-- "Alergias" era texto livre, e o alerta da tela adivinhava pela frase ("não
-- tenho alergia a dipirona" virava alerta, "não sei, acho que não" também).
--
--  1. A ficha que nasce com a rede (`private.ficha_de_pre_atendimento_padrao`,
--     chamada por `trg_rede_nasce_com_pre_atendimento`): "Tem alguma
--     alergia?" (Sim / Não, obrigatória) e, logo ao lado, "Quais alergias?"
--     (texto, obrigatória) que só APARECE no "Sim" (`mostrarSe`, o campo
--     condicional do construtor — `campoVisivel`, `lib/anamnesis.ts`).
--  2. As fichas das redes que já existem (dado de teste — o Heitor: "antes do
--     lançamento vamos fazer wipe total"): a igual à semente vira a semente
--     nova; nas editadas, a pergunta `allergies` em texto vira Sim/Não com o
--     detalhe ao lado. A gestação ganha "Não se aplica" onde ainda faltava
--     ("Reforça", item 7: a [sim] Clínica Aurora tinha editado a sua antes da
--     20261029000601 e ficou sem a opção).
--  3. As respostas guardadas NÃO mudam: cada uma leva o retrato da ficha de
--     quando foi respondida (`versao: 2, ficha: {...}`), e a resposta em texto
--     de antes continua avisando como está escrita (nada a interpreta).
--
-- O corpo da semente de antes é o da produção (pg_get_functiondef em
-- 2026-11-03), guardado na tabela temporária antes de trocar a função.

create temp table semente_de_antes on commit drop as
  select private.ficha_de_pre_atendimento_padrao() as schema;

-- ─── 1. A semente ───────────────────────────────────────────────────────────

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
      jsonb_build_object('id', 'allergies', 'type', 'radio', 'label', 'Tem alguma alergia?',
        'options', jsonb_build_array('Sim', 'Não'), 'required', true),
      jsonb_build_object('id', 'allergiesDetalhe', 'type', 'textarea', 'label', 'Quais alergias?', 'required', true,
        'mostrarSe', jsonb_build_object('campo', 'allergies', 'valor', 'Sim')))),
    jsonb_build_object('id', 'linha-3', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'medications', 'type', 'textarea', 'label', 'Medicamentos em uso', 'required', true),
      jsonb_build_object('id', 'healthConditions', 'type', 'textarea', 'label', 'Condições de saúde', 'required', true))),
    jsonb_build_object('id', 'linha-4', 'fields', jsonb_build_array(
      jsonb_build_object('id', 'previousProcedures', 'type', 'textarea', 'label', 'Procedimentos estéticos anteriores'),
      jsonb_build_object('id', 'observations', 'type', 'textarea', 'label', 'Observações gerais')))
  ))
$$;

-- ─── 2. As fichas das redes ─────────────────────────────────────────────────

-- 2a. A ficha nunca editada vira a semente nova.
update public.forms f
   set schema = private.ficha_de_pre_atendimento_padrao(), updated_at = now()
 where f.tipo = 'PRE_ATENDIMENTO'
   and f.schema = (select schema from semente_de_antes);

-- 2b. A editada: a pergunta `allergies` em texto vira Sim/Não, com o detalhe
-- logo depois dela, na mesma linha; a gestação ganha "Não se aplica".
do $$
declare
  fo     record;
  linhas jsonb;
  linha  jsonb;
  campos jsonb;
  c      jsonb;
  novas  jsonb;
  novos  jsonb;
  mudou  boolean;
begin
  for fo in select id, schema from public.forms
             where tipo = 'PRE_ATENDIMENTO' and schema <> private.ficha_de_pre_atendimento_padrao() loop
    linhas := coalesce(fo.schema -> 'rows', '[]'::jsonb);
    novas  := '[]'::jsonb;
    mudou  := false;
    for linha in select * from jsonb_array_elements(linhas) loop
      campos := coalesce(linha -> 'fields', '[]'::jsonb);
      novos  := '[]'::jsonb;
      for c in select * from jsonb_array_elements(campos) loop
        if c ->> 'id' = 'allergies' and c ->> 'type' in ('text', 'textarea') then
          novos := novos
            || jsonb_build_array(jsonb_build_object(
                 'id', 'allergies', 'type', 'radio',
                 'label', case when c ->> 'label' = 'Alergias' then 'Tem alguma alergia?' else c ->> 'label' end,
                 'options', jsonb_build_array('Sim', 'Não'))
                 || case when (c ->> 'required')::boolean then jsonb_build_object('required', true) else '{}'::jsonb end)
            || jsonb_build_array(jsonb_build_object(
                 'id', 'allergiesDetalhe', 'type', 'textarea', 'label', 'Quais alergias?', 'required', true,
                 'mostrarSe', jsonb_build_object('campo', 'allergies', 'valor', 'Sim')));
          mudou := true;
        elsif c ->> 'id' = 'isPregnantOrBreastfeeding' and c ->> 'type' in ('radio', 'select')
              and not coalesce(c -> 'options', '[]'::jsonb) ? 'Não se aplica' then
          novos := novos || jsonb_build_array(jsonb_set(c, '{options}', coalesce(c -> 'options', '[]'::jsonb) || '["Não se aplica"]'::jsonb));
          mudou := true;
        else
          novos := novos || jsonb_build_array(c);
        end if;
      end loop;
      novas := novas || jsonb_build_array(jsonb_set(linha, '{fields}', novos));
    end loop;
    if mudou then
      update public.forms set schema = jsonb_set(fo.schema, '{rows}', novas), updated_at = now() where id = fo.id;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
