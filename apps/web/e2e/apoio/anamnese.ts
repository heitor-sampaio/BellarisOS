import { banco } from './banco'

/**
 * A ficha de saúde (anamnese geral) da cliente RESPONDIDA, direto no banco,
 * com todas as perguntas obrigatórias da ficha de pré-atendimento da rede
 * (revisão do Heitor, 2026-10-29: "tudo que for obrigatório é obrigatório e
 * barra qualquer progressão"). Desde então o "Finalizar atendimento" e o
 * "Enviar para a recepção" recusam a cliente sem a ficha de saúde — e a ficha
 * padrão de toda rede nasce com quatro obrigatórias. Spec que finaliza um
 * atendimento sem ser sobre a anamnese chama isto antes, como a cliente que
 * respondeu pelo app.
 *
 * Responde só as obrigatórias, com a primeira opção (escolha) ou um texto
 * `[e2e]`. Origem `CLIENTE_APP`: a tela não a regrava como "pela equipe".
 */
export async function responderAnamnese(clienteId: string, tenantId: string): Promise<Record<string, string | string[]>> {
  const db = banco()
  const { data: ficha, error } = await db.from('forms').select('id, name, schema')
    .eq('tenant_id', tenantId).eq('tipo', 'PRE_ATENDIMENTO').maybeSingle()
  if (error) throw new Error(`ler a ficha de pré-atendimento: ${error.message}`)
  type Campo = { id: string; type: string; required?: boolean; options?: string[] }
  const rows = ((ficha?.schema as { rows?: { fields?: Campo[] }[] } | null)?.rows ?? [])
  const respostas: Record<string, string | string[]> = {}
  for (const f of rows.flatMap(r => r.fields ?? [])) {
    if (!f.required || f.type === 'section' || f.type === 'photo' || f.type === 'injectable_map') continue
    const primeira = f.options?.[0]
    respostas[f.id] = f.type === 'checkbox' ? [primeira ?? 'Sim']
      : (f.type === 'select' || f.type === 'radio') ? (primeira ?? 'Sim')
      : f.type === 'number' ? '0'
      : f.type === 'date' ? '2000-01-01'
      : 'Nada a declarar [e2e]'
  }
  const anamnese = {
    versao: 2,
    ficha: { formId: ficha?.id ?? null, nome: ficha?.name ?? 'Pré-atendimento', rows },
    respostas,
    respondidoEm: new Date().toISOString(),
    origem: 'CLIENTE_APP',
    respondidoPor: null,
  }
  const { error: e } = await db.from('medical_records').upsert({ client_id: clienteId, general_anamnesis: anamnese }, { onConflict: 'client_id' })
  if (e) throw new Error(`responder a anamnese: ${e.message}`)
  return respostas
}
