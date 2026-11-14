/**
 * Os documentos que o pacote PUXA dos procedimentos (DC1c/PC9b, Bloco
 * Documentos leva 2 — o Heitor, 13/11: "vai puxar os termos dos procedimentos
 * e vai puxar também os outros documentos que tiver. Ele só não puxa o
 * contrato. [...] deve dar para poder excluir o qual quiser").
 *
 * Puro: é a lista que o pop-up do pacote mostra, e a mesma regra que
 * `private.modelos_do_pacote` aplica na venda — o termo e os outros
 * documentos dos procedimentos DISTINTOS, uma vez cada, sem o contrato do
 * procedimento (vale o contrato de pacote da rede). A rede guarda o que
 * EXCLUIU (`service_packages.documentos_excluidos`): o que a tela mostra é o
 * que nasce na venda, e documento novo ligado ao procedimento entra sozinho.
 */

export type TipoPuxado = 'TERMO' | 'DOCUMENTO'

export interface ModeloAtivo { id: string; nome: string; tipo: string }

export interface ProcedimentoComDocumentos {
  id: string
  nome: string
  termo: string | null
  contrato: string | null
  outros: string[]
}

export interface DocumentoPuxado {
  id: string
  nome: string
  tipo: TipoPuxado
  /** Os procedimentos do pacote que trazem este documento. */
  de: string[]
  excluido: boolean
}

export function documentosPuxadosDoPacote(
  procedimentosDoPacote: readonly string[],
  procedimentos: readonly ProcedimentoComDocumentos[],
  modelosAtivos: readonly ModeloAtivo[],
  excluidos: readonly string[],
): DocumentoPuxado[] {
  const porId = new Map(procedimentos.map(p => [p.id, p]))
  const modelos = new Map(modelosAtivos.map(m => [m.id, m]))
  const fora = new Set(excluidos)
  const puxados = new Map<string, DocumentoPuxado>()
  for (const id of new Set(procedimentosDoPacote)) {
    const p = porId.get(id)
    if (!p) continue
    for (const m of [p.termo, ...p.outros]) {
      const modelo = m ? modelos.get(m) : undefined
      if (!modelo || (modelo.tipo !== 'TERMO' && modelo.tipo !== 'DOCUMENTO')) continue
      const atual = puxados.get(modelo.id)
      if (atual) { if (!atual.de.includes(p.nome)) atual.de.push(p.nome); continue }
      puxados.set(modelo.id, { id: modelo.id, nome: modelo.nome, tipo: modelo.tipo as TipoPuxado, de: [p.nome], excluido: fora.has(modelo.id) })
    }
  }
  // Os termos primeiro, depois os outros documentos — na ordem dos procedimentos.
  const ordem: Record<TipoPuxado, number> = { TERMO: 0, DOCUMENTO: 1 }
  return [...puxados.values()].sort((a, b) => ordem[a.tipo] - ordem[b.tipo])
}
