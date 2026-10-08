/**
 * O custo ESTIMADO do Copilot (2026-10-08). A OpenAI cobra em dólar, por
 * milhão de tokens, de entrada e de saída, conforme o modelo. A clínica calcula
 * o custo de cada chamada (é ela que sabe o modelo e a divisão) e soma em
 * `copilot_uso_mensal.custo_usd`; o sistema mostra em dólar e, pela cotação,
 * em reais.
 *
 * A tabela é a da página de preços da OpenAI (developers.openai.com/api/docs/
 * pricing), conferida em 2026-10-08. Modelo que ela não lista fica SEM custo
 * (null) — melhor um "—" na tela do que um número inventado. Mudou o preço ou
 * o modelo (OPENAI_MODEL, OPENAI_MODELO_DE_VOZ)? Atualize aqui.
 */

/** US$ por MILHÃO de tokens. A transcrição cobra o áudio de entrada. */
const PRECOS: Record<string, { entrada: number; saida: number }> = {
  'gpt-5-mini':             { entrada: 0.25, saida: 2.00 },
  'gpt-5-nano':             { entrada: 0.05, saida: 0.40 },
  'gpt-5':                  { entrada: 1.25, saida: 10.00 },
  'gpt-5.1':                { entrada: 1.25, saida: 10.00 },
  'gpt-4o-mini-transcribe': { entrada: 3.00, saida: 5.00 },
  'gpt-4o-transcribe':      { entrada: 6.00, saida: 10.00 },
}

/** O preço do modelo; o nome com data ("gpt-5-mini-2025-08-07") é o do mais específico. */
function precoDo(modelo: string): { entrada: number; saida: number } | null {
  const nome = modelo.trim().toLowerCase()
  const chave = Object.keys(PRECOS)
    .filter(k => nome === k || nome.startsWith(`${k}-`))
    .sort((x, y) => y.length - x.length)[0]
  return chave ? PRECOS[chave]! : null
}

export function custoEmDolar(modelo: string, tokensDeEntrada: number, tokensDeSaida: number): number | null {
  const p = precoDo(modelo)
  if (!p) return null
  return (Math.max(0, tokensDeEntrada) * p.entrada + Math.max(0, tokensDeSaida) * p.saida) / 1_000_000
}

/** "US$ 1.234,50"; abaixo de um centavo, com uma casa a mais ("US$ 0,004"). */
export function dolares(usd: number): string {
  const pequeno = usd > 0 && usd < 0.01
  return `US$ ${usd.toLocaleString('pt-BR', { minimumFractionDigits: pequeno ? 3 : 2, maximumFractionDigits: pequeno ? 3 : 2 })}`
}

export function reaisEstimados(usd: number, cotacao: number): string {
  return (usd * cotacao).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')
}

/** A cotação do dólar para a ESTIMATIVA em reais (`COTACAO_DOLAR` no sistema); sem ela, 5,50. */
export function cotacaoDoDolar(valor: string | undefined): number {
  const n = Number((valor ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 5.5
}

// ─── O custo REAL (a Costs API da OpenAI) e o rateio por rede ────────────────

/** Um dia da Costs API (`/v1/organization/costs`, `bucket_width=1d`). */
export interface BaldeDeCusto {
  start_time: number
  results: { amount?: { value?: number; currency?: string } }[]
}

/**
 * O custo real por mês (`AAAA-MM-01`), somando os dias. O mês do dia é o do
 * UTC, como a OpenAI separa — na virada, até 3 h de diferença para o mês de
 * Brasília em que o uso é contado.
 */
export function custoPorMes(baldes: BaldeDeCusto[]): Map<string, number> {
  const porMes = new Map<string, number>()
  for (const b of baldes) {
    const mes = `${new Date(b.start_time * 1000).toISOString().slice(0, 7)}-01`
    const soma = (b.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0)
    porMes.set(mes, (porMes.get(mes) ?? 0) + soma)
  }
  return porMes
}

/**
 * O custo real do mês dividido entre as redes. A OpenAI não sabe quais são as
 * redes; o peso de cada uma é o custo ESTIMADO dela (que já pesa entrada e
 * saída pelo preço). Rede sem custo estimado (o uso de antes da coluna) entra
 * pelos tokens, ao preço médio das que têm; sem custo em nenhuma, pelos
 * tokens. A soma das partes fecha com o real.
 */
export function ratearCusto(
  realUsd: number,
  redes: { tenantId: string; custoUsd: number | null; tokens: number }[],
): Map<string, number> {
  const comCusto = redes.filter(r => r.custoUsd !== null)
  const custoConhecido = comCusto.reduce((s, r) => s + (r.custoUsd ?? 0), 0)
  const tokensConhecidos = comCusto.reduce((s, r) => s + r.tokens, 0)
  const precoMedio = custoConhecido > 0 && tokensConhecidos > 0 ? custoConhecido / tokensConhecidos : null
  const peso = (r: { custoUsd: number | null; tokens: number }) =>
    precoMedio === null ? r.tokens : (r.custoUsd ?? r.tokens * precoMedio)
  const total = redes.reduce((s, r) => s + peso(r), 0)
  const partes = new Map<string, number>()
  if (total <= 0) return partes
  for (const r of redes) {
    const p = peso(r)
    if (p > 0) partes.set(r.tenantId, realUsd * p / total)
  }
  return partes
}
