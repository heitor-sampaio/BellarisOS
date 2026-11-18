import { formatBRL } from '@estetica-os/utils'

/**
 * A base EFETIVA da comissão, como a tela a escreve (D3 da 10ª simulação,
 * 2026-11-10; princípio 3). O extrato dizia "base sem a taxa: R$ 420,00 · 40%"
 * ao lado de R$ 165,48 — o preço onde dizia base. A base e o que saiu dela vêm
 * do banco (`comissoes_extrato_com_base`, a conta de `private.comissao_conta`):
 * aqui só se escreve.
 */
export interface BaseDaLinha {
  preco: number | null
  /** A base que a conta usou (base × regra = previsto); nula sem linha. */
  base: number | null
  /** O que saiu do preço antes da taxa: o desconto E os pontos e o voucher. */
  baseDesconto: number
  /**
   * A17 da 25ª (princípio 3): a parte de `baseDesconto` que foi de pontos e
   * voucher — não é desconto (vendas-financeiro.md), e a tela diz à parte.
   * Ausente nas leituras de antes: tudo é desconto, como era.
   */
  baseFidelidade?: number
  baseTaxa: number
  baseInsumos: number
  /** A proporção do que ficou (pacote/plano cancelado, venda devolvida): 1 = tudo. */
  baseFator: number
}

const pct = (f: number) => `${(Math.round(f * 1000) / 10).toLocaleString('pt-BR')}%`

/** "R$ 420,00 − R$ 6,30 da taxa" — o caminho do preço à base; vazio quando a base é o preço. */
export function composicaoDaBase(l: BaseDaLinha): string {
  if (l.preco == null || l.base == null) return ''
  const fidelidade = Math.min(Math.max(l.baseFidelidade ?? 0, 0), l.baseDesconto)
  const desconto = Math.round((l.baseDesconto - fidelidade) * 100) / 100
  const partes = [
    desconto > 0 ? `${formatBRL(desconto)} de desconto` : null,
    fidelidade > 0 ? `${formatBRL(fidelidade)} de pontos e voucher` : null,
    l.baseTaxa > 0 ? `${formatBRL(l.baseTaxa)} da taxa` : null,
    l.baseInsumos > 0 ? `${formatBRL(l.baseInsumos)} de insumos` : null,
  ].filter(Boolean)
  const menos = partes.length ? ` − ${partes.join(' − ')}` : ''
  const fica = l.baseFator < 1 ? `, na proporção do que ficou (${pct(l.baseFator)})` : ''
  if (!menos && !fica) return ''
  return `${formatBRL(l.preco)}${menos}${fica}`
}

/** "base sem a taxa…: R$ 413,70 (R$ 420,00 − R$ 6,30 da taxa)". */
export function textoDaBase(rotulo: string, l: BaseDaLinha): string {
  const valor = l.base ?? l.preco
  if (valor == null) return ''
  const como = composicaoDaBase(l)
  return `${rotulo}: ${formatBRL(valor)}${como ? ` (${como})` : ''}`
}
