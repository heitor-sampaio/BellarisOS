import { flattenFields, normalizeFormSchema, type AnamnesisRow } from '@/lib/anamnesis'

/**
 * A ficha própria do procedimento na conclusão do atendimento (D1 da simulação
 * de 2026-10-29). O "Finalizar" leva as respostas que estão NA TELA, e
 * `concluir_atendimento` as grava em `medical_record_entries.form_data.ficha`
 * na mesma transação — o mesmo formato de `salvarFichaDoProcedimento`: o
 * retrato da ficha de agora (as perguntas) e as respostas.
 *
 * Só fica resposta de campo da ficha: chave de fora e seção (título) não
 * entram. O valor vai como veio (texto, lista das caixas, o planejador de
 * injetáveis) — é o que o salvar da ficha também grava.
 */
export interface FichaParaConcluir {
  formId:  string
  name:    string
  rows:    AnamnesisRow[]
  answers: Record<string, unknown>
}

export function fichaParaConcluir(
  form: { id: string; name: string; schema: unknown } | null,
  respostas: unknown,
): FichaParaConcluir | null {
  if (!form) return null
  if (!respostas || typeof respostas !== 'object' || Array.isArray(respostas)) return null
  const rows = normalizeFormSchema(form.schema).rows
  const campos = new Set(flattenFields({ rows }).filter(f => f.type !== 'section').map(f => f.id))
  if (campos.size === 0) return null
  const answers: Record<string, unknown> = {}
  for (const [id, valor] of Object.entries(respostas as Record<string, unknown>)) {
    if (campos.has(id) && valor !== undefined) answers[id] = valor
  }
  return { formId: form.id, name: form.name, rows, answers }
}
