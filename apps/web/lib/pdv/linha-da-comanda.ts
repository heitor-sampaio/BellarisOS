import { formatBRL } from '@estetica-os/utils'

/**
 * A linha da comanda do PDV (D3 e A5 da 21ª simulação; princípio 3): a coluna
 * da quantidade era o "1" fixo — a venda de 2 Sérum dizia "1 · R$ 300,00", e o
 * plano de 3 sessões "1 · R$ 540,00". A linha diz o que foi vendido:
 * - a venda de produto: as unidades e o preço de cada ("2 × R$ 150,00"); o kit
 *   de vários produtos é um (a descrição já os lista);
 * - o pré-pago: as unidades do procedimento;
 * - o plano: as sessões, e o que há nelas ("3 sessões: 2 × Limpeza, 1 × Peeling");
 * - o atendimento, o pacote e o crédito: um.
 *
 * Puro: a leitura mora em `./linha-da-comanda-leitura` (servidor).
 */
export type VendaDaLinha =
  | { tipo: 'PRODUTO'; quantidade: number; precoUnitario: number | null; total: number; itens: number }
  | { tipo: 'PRE_PAGO'; quantidade: number; precoUnitario: number | null; total: number }
  | { tipo: 'PLANO'; sessoes: { procedimentos: string[] }[] }

export interface LinhaDaComanda {
  quantidade: number
  /** "2 × R$ 150,00", "3 sessões: 3 × Limpeza" — ou nulo. */
  detalhe:    string | null
}

const centavos = (v: number) => Math.round(v * 100)

function unitario(quantidade: number, preco: number | null, total: number): string | null {
  if (!(quantidade > 1) || preco == null || !(preco > 0)) return null
  const cheio = centavos(preco) * quantidade
  const desconto = cheio - centavos(total)
  const base = `${quantidade} × ${formatBRL(preco)}`
  return desconto > 0 ? `${base} (${formatBRL(desconto / 100)} de desconto)` : base
}

export function linhaDaComanda(v: VendaDaLinha | null): LinhaDaComanda {
  if (!v) return { quantidade: 1, detalhe: null }
  if (v.tipo === 'PLANO') {
    const n = v.sessoes.length
    if (!n) return { quantidade: 1, detalhe: null }
    const conta = new Map<string, number>()
    for (const s of v.sessoes) for (const p of s.procedimentos) conta.set(p, (conta.get(p) ?? 0) + 1)
    const itens = [...conta].sort((a, b) => b[1] - a[1]).map(([nome, q]) => `${q} × ${nome}`)
    return { quantidade: n, detalhe: `${n} ${n === 1 ? 'sessão' : 'sessões'}${itens.length ? `: ${itens.join(', ')}` : ''}` }
  }
  if (v.tipo === 'PRODUTO' && v.itens > 1) return { quantidade: 1, detalhe: null }
  const quantidade = Math.max(1, Math.trunc(v.quantidade) || 1)
  return { quantidade, detalhe: unitario(quantidade, v.precoUnitario, v.total) }
}
