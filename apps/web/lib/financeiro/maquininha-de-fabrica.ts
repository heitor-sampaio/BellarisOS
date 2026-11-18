/**
 * A4 da 23ª simulação (2026-11-17; princípio 7): toda rede nasce com uma
 * "Maquininha" vazia (o espelho do gatilho `trg_maquininha_espelha_rede`), e o
 * "+ Adicionar maquininha" criava uma SEGUNDA — a vazia ficava valendo zero, e
 * o PDV oferecia as duas. Na rede que só tem essa vazia, o "Adicionar"
 * preenche a que existe: ela perde o nome de fábrica e pede o nome e as taxas.
 *
 * Puro: roda no navegador (a tela de Taxas).
 */

export interface MaquininhaParaConferir {
  id: string | null
  nome: string
  /** As taxas em texto ("3,5"), como a tela as edita. */
  valores: Record<string, string>
  maxVezes: string
  porBandeira: Partial<Record<string, { prazo: string; valores: Record<string, string> } | undefined>>
  arquivada: boolean
}

/** O nome com que o banco a cria (`private.maquininha_espelha_o_antigo`). */
export const NOME_DA_MAQUININHA_DE_FABRICA = 'Maquininha'

const vazio = (v: string | undefined) => {
  const t = (v ?? '').trim()
  return t === '' || Number(t.replace(',', '.')) === 0
}

/**
 * A maquininha de fábrica que o "Adicionar" preenche: a ÚNICA da rede (nenhuma
 * outra, nem arquivada), gravada, com o nome de fábrica e sem taxa nenhuma —
 * nem limite de vezes, nem bandeira. Com qualquer coisa preenchida, ela é da
 * rede, e o "Adicionar" cria outra.
 */
export function vaziaDeFabrica<T extends MaquininhaParaConferir>(lista: readonly T[]): T | null {
  if (lista.length !== 1) return null
  const m = lista[0]!
  if (m.arquivada || !m.id || m.nome.trim() !== NOME_DA_MAQUININHA_DE_FABRICA) return null
  if (!Object.values(m.valores).every(vazio) || m.maxVezes.trim() !== '') return null
  const bandeiras = Object.values(m.porBandeira)
  if (bandeiras.some(b => b && (b.prazo.trim() !== '' || !Object.values(b.valores).every(vazio)))) return null
  return m
}
