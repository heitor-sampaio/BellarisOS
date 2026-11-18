/**
 * O chip da comissão na linha da Equipe (A22 da 19ª simulação, 2026-11-16;
 * princípio 3). Era "Sem comissão" igual em todas as linhas — para quem atende
 * (falta a de atendimento) e para quem só vende (falta a de venda) —, e a
 * Patrícia deu 25% de atendimento a quem só vende. O chip diz QUAL comissão.
 * `padrao` é o rótulo da regra padrão ("25%", "R$ 30,00 fixo"); nulo, sem.
 */
const pct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export function chipDaComissao(c: { padrao: string | null; excecoes: number; vendaPct: number | null; atende: boolean }): string {
  const venda = c.vendaPct != null && c.vendaPct > 0 ? c.vendaPct : null
  const excecoes = c.excecoes > 0 ? ` · ${c.excecoes} ${c.excecoes === 1 ? 'exceção' : 'exceções'}` : ''
  const daVenda = venda != null ? ` · venda ${pct(venda)}%` : ''
  if (c.padrao) return `Comissão ${c.padrao}${excecoes}${daVenda}`
  if (c.atende || c.excecoes > 0) return `${c.excecoes > 0 ? 'Sem comissão padrão' : 'Sem comissão de atendimento'}${excecoes}${daVenda}`
  // A6 da 24ª (princípio 3): "Sem comissão de venda" em quem ganhou a do
  // pacote — sem a dela, vale a do pacote ou do produto, e depois a da rede.
  return venda != null ? `Venda ${pct(venda)}%` : 'Venda: a do pacote, produto ou rede'
}
