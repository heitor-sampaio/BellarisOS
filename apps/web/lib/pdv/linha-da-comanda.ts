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
 * A15 da 24ª (princípio 3): a venda com desconto dizia o item a R$ 117, sem
 * a linha do desconto de R$ 3 — a linha devolve o `desconto` da venda (o
 * gravado; sem ele, a conta do unitário), e a comanda mostra o item cheio e o
 * desconto numa linha própria. O detalhe fica só com o unitário.
 *
 * Puro: a leitura mora em `./linha-da-comanda-leitura` (servidor).
 */
export type VendaDaLinha =
  | { tipo: 'PRODUTO'; quantidade: number; precoUnitario: number | null; total: number; itens: number; desconto?: number }
  | { tipo: 'PRE_PAGO'; quantidade: number; precoUnitario: number | null; total: number; desconto?: number }
  | { tipo: 'PLANO'; sessoes: { procedimentos: string[] }[] }
  | { tipo: 'PACOTE'; desconto: number }

export interface LinhaDaComanda {
  quantidade: number
  /** "2 × R$ 150,00", "3 sessões: 3 × Limpeza" — ou nulo. */
  detalhe:    string | null
  /** O desconto da venda, em reais (só quando há). */
  desconto?:  number
}

const centavos = (v: number) => Math.round(v * 100)

function unitario(quantidade: number, preco: number | null): string | null {
  if (!(quantidade > 1) || preco == null || !(preco > 0)) return null
  return `${quantidade} × ${formatBRL(preco)}`
}

/** O desconto da venda: o gravado; sem ele, o cheio (unitário × quantidade) menos o vendido. */
function descontoDaVenda(quantidade: number, preco: number | null, total: number, gravado: number | undefined): number {
  if (gravado != null) return Math.max(0, centavos(gravado)) / 100
  if (preco == null || !(preco > 0)) return 0
  return Math.max(0, centavos(preco) * quantidade - centavos(total)) / 100
}

const comDesconto = (l: LinhaDaComanda, desconto: number): LinhaDaComanda => (desconto > 0 ? { ...l, desconto } : l)

export function linhaDaComanda(v: VendaDaLinha | null): LinhaDaComanda {
  if (!v) return { quantidade: 1, detalhe: null }
  if (v.tipo === 'PACOTE') return comDesconto({ quantidade: 1, detalhe: null }, Math.max(0, centavos(v.desconto)) / 100)
  if (v.tipo === 'PLANO') {
    const n = v.sessoes.length
    if (!n) return { quantidade: 1, detalhe: null }
    const conta = new Map<string, number>()
    for (const s of v.sessoes) for (const p of s.procedimentos) conta.set(p, (conta.get(p) ?? 0) + 1)
    const itens = [...conta].sort((a, b) => b[1] - a[1]).map(([nome, q]) => `${q} × ${nome}`)
    return { quantidade: n, detalhe: `${n} ${n === 1 ? 'sessão' : 'sessões'}${itens.length ? `: ${itens.join(', ')}` : ''}` }
  }
  if (v.tipo === 'PRODUTO' && v.itens > 1) return comDesconto({ quantidade: 1, detalhe: null }, Math.max(0, centavos(v.desconto ?? 0)) / 100)
  const quantidade = Math.max(1, Math.trunc(v.quantidade) || 1)
  return comDesconto({ quantidade, detalhe: unitario(quantidade, v.precoUnitario) }, descontoDaVenda(quantidade, v.precoUnitario, v.total, v.desconto))
}
