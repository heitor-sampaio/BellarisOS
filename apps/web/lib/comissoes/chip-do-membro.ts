/**
 * O chip da comissão na linha da Equipe (A22 da 19ª simulação, 2026-11-16;
 * princípio 3). Era "Sem comissão" igual em todas as linhas — para quem atende
 * (falta a de atendimento) e para quem só vende (falta a de venda) —, e a
 * Patrícia deu 25% de atendimento a quem só vende. O chip diz QUAL comissão.
 * `padrao` é o rótulo da regra padrão ("25%", "R$ 30,00 fixo"); nulo, sem.
 */
const pct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/**
 * A comissão de venda da REDE (Configurações → Comissões e taxas): a "Venda de
 * plano" e a "Venda de produto" — o pacote e o pré-pago não têm a da rede.
 */
export interface VendaDaRede { plano: number | null; produto: number | null }

const daRedeEmTexto = (r: VendaDaRede): string => {
  const plano = r.plano != null && r.plano > 0 ? r.plano : null
  const produto = r.produto != null && r.produto > 0 ? r.produto : null
  // Princípio 4 (não chutar): sem nenhuma, a linha diz que a rede não tem.
  if (plano == null && produto == null) return 'sem ela, nenhuma: a rede não tem'
  if (plano === produto) return `sem ela, a da rede: ${pct(plano!)}%`
  const parte = (v: number | null, onde: string) => `${v == null ? 'nenhuma' : `${pct(v)}%`} no ${onde}`
  return `sem ela, a da rede: ${parte(plano, 'plano')}, ${parte(produto, 'produto')}`
}

export function chipDaComissao(c: {
  padrao: string | null; excecoes: number; vendaPct: number | null; atende: boolean
  /** A comissão de venda da rede (o Heitor, 25/11: "Diz o percentual da rede"). */
  vendaDaRede?: VendaDaRede
}): string {
  const venda = c.vendaPct != null && c.vendaPct > 0 ? c.vendaPct : null
  const excecoes = c.excecoes > 0 ? ` · ${c.excecoes} ${c.excecoes === 1 ? 'exceção' : 'exceções'}` : ''
  const daVenda = venda != null ? ` · venda ${pct(venda)}%` : ''
  if (c.padrao) return `Comissão ${c.padrao}${excecoes}${daVenda}`
  if (c.atende || c.excecoes > 0) return `${c.excecoes > 0 ? 'Sem comissão padrão' : 'Sem comissão de atendimento'}${excecoes}${daVenda}`
  // A6 da 24ª (princípio 3): "Sem comissão de venda" em quem ganhou a do
  // pacote — sem a dela, vale a do pacote ou do produto, e depois a da rede.
  // O Heitor, 25/11 ("Diz o percentual da rede"): a linha diz quanto é a da rede.
  if (venda != null) return `Venda ${pct(venda)}%`
  return `Venda: a do pacote ou produto vendido${c.vendaDaRede ? ` (${daRedeEmTexto(c.vendaDaRede)})` : ' (sem ela, a da rede)'}`
}
