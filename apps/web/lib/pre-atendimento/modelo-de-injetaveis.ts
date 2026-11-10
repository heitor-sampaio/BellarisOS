import type { AnamnesisRow } from '@/lib/anamnesis'

/**
 * O MODELO de perguntas de injetáveis para a ficha de pré-atendimento (A30 da
 * 11ª simulação, 2026-11-10: a ficha padrão não perguntava doença
 * neuromuscular, toxina anterior, anticoagulante nem herpes, e a clínica de
 * injetáveis não tinha de onde partir). Nada entra sozinho (princípio 6): a
 * clínica acrescenta pelo "Acrescentar as perguntas de injetáveis" do
 * construtor, revisa e salva. Os ids começam com `inj_` — acrescentar de novo
 * não duplica (`comAsPerguntasDoModelo`).
 */
export const PERGUNTAS_DE_INJETAVEIS: AnamnesisRow[] = [
  { id: 'inj_r0', fields: [{ id: 'inj_secao', type: 'section', label: 'Injetáveis (toxina e preenchedores)' }] },
  { id: 'inj_r1', fields: [{ id: 'inj_neuromuscular', type: 'radio', label: 'Tem doença neuromuscular (miastenia gravis, ELA, Lambert-Eaton)?', options: ['Sim', 'Não'], required: true }] },
  { id: 'inj_r2', fields: [{ id: 'inj_toxina_anterior', type: 'radio', label: 'Aplicou toxina botulínica nos últimos 4 meses?', options: ['Sim', 'Não'], required: true }] },
  { id: 'inj_r3', fields: [{ id: 'inj_toxina_quando', type: 'text', label: 'Quando e onde foi a última aplicação?', mostrarSe: { campo: 'inj_toxina_anterior', valor: 'Sim' } }] },
  { id: 'inj_r4', fields: [{ id: 'inj_preenchimento', type: 'radio', label: 'Já fez preenchimento (ácido hialurônico ou outro) na região a tratar?', options: ['Sim', 'Não'] }] },
  { id: 'inj_r5', fields: [{ id: 'inj_anticoagulante', type: 'radio', label: 'Usa anticoagulante, AAS ou anti-inflamatório com frequência?', options: ['Sim', 'Não'], required: true }] },
  { id: 'inj_r6', fields: [{ id: 'inj_herpes', type: 'radio', label: 'Tem herpes labial recorrente?', options: ['Sim', 'Não'], required: true }] },
  { id: 'inj_r7', fields: [{ id: 'inj_reacao', type: 'radio', label: 'Já teve reação a algum injetável (alergia, inchaço prolongado, nódulo)?', options: ['Sim', 'Não'] }] },
  { id: 'inj_r8', fields: [{ id: 'inj_reacao_qual', type: 'textarea', label: 'Qual reação?', mostrarSe: { campo: 'inj_reacao', valor: 'Sim' } }] },
]

/** A ficha com as perguntas do modelo no fim — só as que ela ainda não tem (pelo id). */
export function comAsPerguntasDoModelo(rows: AnamnesisRow[], modelo: AnamnesisRow[] = PERGUNTAS_DE_INJETAVEIS): AnamnesisRow[] {
  const ja = new Set(rows.flatMap(r => r.fields.map(f => f.id)))
  const novas = modelo
    .map(r => ({ ...r, fields: r.fields.filter(f => !ja.has(f.id)).map(f => ({ ...f, ...(f.options ? { options: [...f.options] } : {}) })) }))
    .filter(r => r.fields.length > 0)
  return [...rows, ...novas]
}
