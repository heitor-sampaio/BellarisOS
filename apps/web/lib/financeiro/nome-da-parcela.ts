/**
 * O nome da linha de um lançamento que tem o procedimento do atendimento (A16 e
 * A18 da 30ª simulação; vendas-financeiro:CR-05, "— parcela 2/3", e AC-01, "a
 * parcela pendente diz qual é"; princípio 3). A ficha, o app e os Relatórios
 * mostravam só "Microagulhamento" (o nome do procedimento no lugar da
 * descrição), e as três parcelas do crediário pareciam a mesma; ou a descrição
 * crua, "Atendimento concluído — parcela 2/3", sem dizer de quê.
 *
 * Com o procedimento, é ele com a parte da venda: "Microagulhamento — parcela
 * 2/3", "Microagulhamento — entrada". A parte vem da descrição gravada (" —
 * parcela 2/3", " — entrada", `lib/checkout/lancamentos.ts`) ou, sem ela, do
 * número e do total da parcela. Sem procedimento, nulo: a tela mostra a
 * descrição, que já diz a parcela. Puro: a tela e o servidor chamam.
 */
export function nomeDaLinhaDoLancamento(
  procedimento: string | null | undefined,
  l: { numero?: number | null; total?: number | null; descricao?: string | null },
): string | null {
  const nome = procedimento?.trim()
  if (!nome) return null
  const parte = parteDaVenda(l)
  return parte ? `${nome} — ${parte}` : nome
}

/**
 * O nome da linha de um lançamento do PLANO (A5 da 31ª; o mesmo CR-05 e AC-01,
 * princípio 3): a 30ª deu o procedimento à parcela do atendimento, e a do
 * plano seguia "Plano de tratamento — parcela 1/2", sem dizer de quê. A
 * descrição gravada não muda (`plano_checkout`); a linha diz os procedimentos
 * do plano, com as vezes, na ordem dele: "Plano de tratamento (4× Drenagem +
 * 2× Radiofrequência) — parcela 1/2". `procedimentos` é um nome por
 * procedimento de cada sessão. Sem procedimento, ou descrição que não é a do
 * plano (o estorno), nulo: a tela mostra a descrição. Puro.
 */
export function nomeDaLinhaDoPlano(procedimentos: string[], descricao: string | null | undefined): string | null {
  const PREFIXO = 'Plano de tratamento'
  if (!descricao?.startsWith(PREFIXO)) return null
  const vezes = new Map<string, number>()
  for (const p of procedimentos) {
    const nome = p?.trim()
    if (nome) vezes.set(nome, (vezes.get(nome) ?? 0) + 1)
  }
  if (!vezes.size) return null
  const lista = [...vezes].map(([nome, n]) => `${n}× ${nome}`).join(' + ')
  return `${PREFIXO} (${lista})${descricao.slice(PREFIXO.length)}`
}

/** "parcela 2/3", "entrada" — ou nulo, o lançamento sem parcelas. */
export function parteDaVenda(l: { numero?: number | null; total?: number | null; descricao?: string | null }): string | null {
  const gravada = l.descricao?.match(/\s—\s(parcela \d+\/\d+|entrada)\s*$/i)?.[1]
  if (gravada) return gravada.toLocaleLowerCase('pt-BR')
  if (l.numero != null && l.total != null) return `parcela ${l.numero}/${l.total}`
  return null
}

/**
 * O prazo da parcela a receber em palavras (A18 da 30ª; princípio 7): "vence
 * em 61 dias", "vence amanhã", "vence hoje", "3 dias de atraso". A coluna dos
 * Relatórios dizia "61d" e "vencida há 3d" — não dizia se era atraso ou prazo.
 * `dias` vem de `diasAteOVencimento` (o dia da unidade).
 */
export function prazoDaParcela(dias: number): string {
  if (dias < 0) return `${-dias} ${dias === -1 ? 'dia' : 'dias'} de atraso`
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  return `vence em ${dias} dias`
}
