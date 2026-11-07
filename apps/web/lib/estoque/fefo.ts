import { loteVencido, validadeNaTela } from './validade'
import { formatarDose } from '@/lib/injetaveis/dose'

/**
 * De qual lote sai o insumo do atendimento (A11 da 9ª simulação, 2026-11-07):
 * o FEFO estava certo, mas só o Estoque dizia de qual frasco saiu. A baixa é
 * do GATILHO (`trg_lote_do_movimento`, a regra fica — CLAUDE.md §9.5); esta é a
 * MESMA ordem dele, para a tela dizer antes de finalizar: os lotes com saldo,
 * os vencidos por último, o que vence primeiro antes, o sem validade depois dos
 * com validade e, no empate, o que chegou antes. Puro: a tela e os testes.
 *
 * A quantidade do lote é em EMBALAGENS (como no banco); a dose e o que sai de
 * cada lote, na unidade de CONSUMO (× o fator — o rendimento da embalagem).
 */
export interface LoteParaBaixa { id: string; numero: string | null; validade: string | null; recebidoEm: string | null; quantidade: number }
export interface ParteDaBaixa { id: string; numero: string | null; validade: string | null; quantidade: number }

const arred = (n: number) => Math.round(n * 1000) / 1000

export function lotesDaBaixa(lotes: LoteParaBaixa[], dose: number, fator: number, hoje: Date = new Date()): ParteDaBaixa[] {
  const f = fator > 0 ? fator : 1
  const ordem = [...lotes].filter(l => l.quantidade > 0).sort((a, b) => {
    const va = loteVencido(a.validade, hoje) ? 1 : 0, vb = loteVencido(b.validade, hoje) ? 1 : 0
    if (va !== vb) return va - vb
    if (a.validade !== b.validade) {
      if (!a.validade) return 1
      if (!b.validade) return -1
      return a.validade < b.validade ? -1 : 1
    }
    return (a.recebidoEm ?? '').localeCompare(b.recebidoEm ?? '')
  })
  let falta = dose
  const saida: ParteDaBaixa[] = []
  for (const l of ordem) {
    if (falta <= 0.0005) break
    const tira = Math.min(arred(l.quantidade * f), falta)
    saida.push({ id: l.id, numero: l.numero, validade: l.validade, quantidade: arred(tira) })
    falta = arred(falta - tira)
  }
  return saida
}

const nomeDoLote = (p: ParteDaBaixa) =>
  `lote ${p.numero ?? 'sem número'}${p.validade ? ` (vence ${validadeNaTela(p.validade)})` : ''}`

/**
 * "Sai do lote TOX-A1 (vence 26/11/2026)"; com mais de um, a quantidade de
 * cada; o que os lotes não cobrem, "sem lote" (o saldo fica negativo — §10).
 * Sem lote nenhum, nada a dizer. Com `feita` (o atendimento concluído), "Saiu do" — a baixa que houve.
 */
export function textoDosLotesDaBaixa(partes: ParteDaBaixa[], unidade: string, dose: number, feita = false): string | null {
  if (!partes.length) return null
  const coberto = arred(partes.reduce((s, p) => s + p.quantidade, 0))
  const semLote = arred(dose - coberto)
  const sai = feita ? 'Saiu do' : 'Sai do'
  if (partes.length === 1 && semLote <= 0.0005) return `${sai} ${nomeDoLote(partes[0]!)}`
  const trechos = partes.map((p, i) => `${i === 0 ? sai : 'e do'} ${nomeDoLote(p)}: ${formatarDose(p.quantidade)} ${unidade}`)
  if (semLote > 0.0005) trechos.push(`${formatarDose(semLote)} ${unidade} sem lote`)
  return trechos.join('; ')
}
