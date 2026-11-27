import { lotesDaBaixa, type LoteParaBaixa } from '@/lib/estoque/fefo'
import { loteVencido, validadeNaTela } from '@/lib/estoque/validade'
import { quantidadeComMedida } from '@/lib/estoque/medidas'

/**
 * D3 da 38ª simulação (atendimento:ES-24, "o vencido é sinalizado, não
 * bloqueado"): a venda de produto tirava do lote vencido depois do válido — a
 * ordem certa —, e nada dizia que uma unidade saía de lote vencido. A conta é
 * a MESMA do gatilho do lote e da sessão de atendimento (`lotesDaBaixa`, em
 * embalagens: a venda é de embalagens inteiras). Puro: a tela e os testes.
 */
export interface ParteVencida { numero: string | null; validade: string | null; quantidade: number }

const arred = (n: number) => Math.round(n * 1000) / 1000

/**
 * O que sai de lote vencido ao tirar `quantidade` embalagens, depois de `jaSai`
 * (o que outra linha do mesmo produto tira antes, na mesma comanda).
 */
export function partesVencidasDaSaida(
  lotes: readonly LoteParaBaixa[] | null | undefined, quantidade: number, hoje: Date, fuso?: string, jaSai = 0,
): ParteVencida[] {
  if (!lotes?.length || !(quantidade > 0)) return []
  const antes = new Map(lotesDaBaixa([...lotes], Math.max(0, jaSai), 1, hoje, fuso).map(p => [p.id, p.quantidade]))
  return lotesDaBaixa([...lotes], Math.max(0, jaSai) + quantidade, 1, hoje, fuso)
    .map(p => ({ numero: p.numero, validade: p.validade, quantidade: arred(p.quantidade - (antes.get(p.id) ?? 0)) }))
    .filter(p => p.quantidade > 0.0005 && loteVencido(p.validade, hoje, fuso))
}

/** "1 un sai do lote PS1, vencido em 14/11/2026" (antes); "saiu" depois. Nada vencido, nulo. */
export function textoDoVencidoNaVenda(partes: readonly ParteVencida[], medida: string, feita = false): string | null {
  if (!partes.length) return null
  return partes.map(p => {
    const varias = p.quantidade >= 2
    const verbo = feita ? (varias ? 'saíram' : 'saiu') : (varias ? 'saem' : 'sai')
    return `${quantidadeComMedida(p.quantidade, medida, 2)} ${verbo} do lote ${p.numero ?? 'sem número'}, vencido em ${validadeNaTela(p.validade)}`
  }).join('; ')
}

/**
 * Depois (o Histórico do produto): a saída para uma cliente — a venda, o insumo
 * do atendimento — que tirou de lote JÁ vencido no dia dela. `lotes` é o que
 * cada lote cobriu, na unidade do movimento (`partesDoMovimento`).
 */
export function vencidoNaSaidaDoMovimento(
  tipo: string, lotes: readonly ParteVencida[], medida: string, quando: Date, fuso?: string,
): string | null {
  if (tipo !== 'SALE' && tipo !== 'PROCEDURE_USAGE') return null
  return textoDoVencidoNaVenda(lotes.filter(l => l.quantidade > 0 && loteVencido(l.validade, quando, fuso)), medida, true)
}
