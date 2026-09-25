-- Um construtor de fichas só, e a avaliação deixa de ser uma entidade.
--
-- Decisão do Heitor em 2026-09-25: "não precisamos de criação de ficha
-- específica de anamnese, isso pode ser feito pelo construtor universal de
-- fichas. A entidade avaliação deixou de existir e passou a poder ser criada
-- como um procedimento."
--
-- Eram dois construtores com o MESMO código e dois nomes: quem montava uma
-- ficha tinha de decidir antes se ela era "de anamnese" ou "de atendimento", e
-- a escolha não mudava nada — nem os campos, nem quando a ficha aparece. Agora
-- o procedimento tem UMA ficha, com os campos que ele precisar. Se o
-- procedimento é a avaliação, os campos são os da avaliação.
--
-- Conferido no banco antes de rodar: 0 agendamentos sem procedimento, 0 fichas
-- preenchidas (`anamnesis_data` e `attendance_data` vazios nas 21 entradas), e
-- os 2 agendamentos marcados como avaliação já apontam para o procedimento
-- "Avaliação". Nada de prontuário se perde aqui.

-- ── 1. A ficha do procedimento passa a ser uma só ───────────────────────────
ALTER TABLE attendance_forms      RENAME TO forms;
ALTER TABLE procedures            RENAME COLUMN attendance_form_id TO form_id;
ALTER TABLE medical_record_entries RENAME COLUMN attendance_data   TO form_data;

COMMENT ON TABLE forms IS
  'Fichas montadas pelo construtor e ligadas a um procedimento. Uma por procedimento.';

-- ── 2. O construtor de anamnese sai ─────────────────────────────────────────
-- `medical_records.general_anamnesis` NÃO é isto e fica: aquilo é o
-- questionário de saúde do CLIENTE, preenchido uma vez, que alimenta o termo
-- de consentimento e o planejamento. O que sai é o construtor de fichas "de
-- anamnese" por procedimento, que duplicava o de atendimento.
ALTER TABLE procedures DROP COLUMN IF EXISTS anamnesis_form_id;
DROP TABLE IF EXISTS anamnesis_forms;

-- `anamnesis_data` guardava DUAS coisas por acidente: as respostas da ficha de
-- anamnese (sempre vazias) e, em um caminho, as observações do atendimento —
-- que têm coluna própria, `notes`, ao lado. As observações são reaproveitadas
-- antes de a coluna sair; o resto está vazio em todas as 21 entradas.
UPDATE medical_record_entries
   SET notes = COALESCE(NULLIF(notes, ''), anamnesis_data->>'notes')
 WHERE anamnesis_data ? 'notes'
   AND COALESCE(anamnesis_data->>'notes', '') <> '';

ALTER TABLE medical_record_entries DROP COLUMN IF EXISTS anamnesis_data;

-- ── 3. A entidade avaliação sai ─────────────────────────────────────────────
-- Ela existia para permitir agendar SEM procedimento escolhido. Com a
-- avaliação virando procedimento, todo agendamento tem procedimento — e a
-- coluna que dizia "este é especial" deixa de ter o que distinguir.
ALTER TABLE procedures   DROP COLUMN IF EXISTS is_evaluation;
ALTER TABLE appointments DROP COLUMN IF EXISTS is_evaluation;

-- O PostgREST guarda o desenho do schema em cache; sem isto, a API continua
-- respondendo pelo desenho antigo e some coluna que existe.
NOTIFY pgrst, 'reload schema';
