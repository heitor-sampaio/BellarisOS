import { parseDinheiro } from '@estetica-os/utils'

/**
 * O valor que o card da oportunidade mostra (D1 da 30ª simulação;
 * crm-inbox:OP-01, "o card tem … valor"; princípios 3 e 4). Puro: o quadro e
 * o teste usam.
 *
 * Na ordem: o VENDIDO da cliente ligada (OP-30), senão o valor estimado da
 * oportunidade (`leads.value`: a importação o traz — IM-07 — e a janela o
 * edita), senão a soma dos preços de tabela dos procedimentos de interesse. A
 * linha diz qual dos três é (decisão do Claude, 25/11, princípio 3): até aqui
 * o preço de tabela aparecia sozinho, como se fosse o valor dela, e o estimado
 * gravado nunca aparecia. Sem nenhum dos três, nada (princípio 4: não se chuta).
 */
export type TipoDoValor = 'vendido' | 'estimado' | 'tabela'

const ROTULO: Record<TipoDoValor, string> = { vendido: 'vendido', estimado: 'estimado', tabela: 'de tabela' }

export function valorDoCard(lead: {
  compra_valor?: number | null
  value?: number | string | null
  lead_procedures: { procedures: { price: number } | null }[]
}): { valor: number; tipo: TipoDoValor; rotulo: string } | null {
  const com = (valor: number, tipo: TipoDoValor) => ({ valor, tipo, rotulo: ROTULO[tipo] })
  if (lead.compra_valor != null && lead.compra_valor > 0) return com(lead.compra_valor, 'vendido')
  const estimado = lead.value == null || lead.value === '' ? null : Number(lead.value)
  if (estimado != null && Number.isFinite(estimado)) return com(estimado, 'estimado')
  const tabela = lead.lead_procedures.reduce((s, lp) => s + (lp.procedures?.price ?? 0), 0)
  return tabela > 0 ? com(tabela, 'tabela') : null
}

/**
 * O valor estimado digitado na janela: vazio é NULO ("ainda sem proposta" —
 * zero seria "negociado por nada"); o ilegível e o negativo são recusados com
 * o motivo, em vez de virar nulo e apagar o que estava (princípio 2: só o
 * impossível se recusa).
 */
export function lerValorEstimado(bruto: string | null | undefined): { valor: number | null } | { error: string } {
  const texto = (bruto ?? '').trim()
  if (!texto) return { valor: null }
  const numero = parseDinheiro(texto)
  if (!Number.isFinite(numero)) return { error: 'Valor estimado inválido. Use só números, como 1.500,00.' }
  if (numero < 0) return { error: 'O valor estimado não pode ser negativo.' }
  return { valor: numero }
}
