/**
 * Drena uma fila do cron em lotes, até esvaziar ou até o orçamento de tempo.
 *
 * O cron das automações pegava UM lote de 50 por passagem, do mais velho para
 * o mais novo (F71, a completa de 2026-11-12): com mais de 50 fatos a cada 5
 * minutos a fila crescia sem fim, e o fato novo nunca chegava à frente — a
 * automação "Pagamento recebido → avisar" ficava calada. Um lote só é teto,
 * não drenagem.
 *
 * As regras:
 *  - **lote por lote**, até vir um lote MENOR que o tamanho (a fila acabou) ou
 *    vazio (outra passagem levou o resto);
 *  - **o orçamento de tempo** encerra a passagem: o que sobrar é da próxima,
 *    e o cron responde antes do teto do serviço;
 *  - **reivindicar continua sendo de quem processa** (`processar` devolve
 *    quantos ELA levou): um lote cheio que outra passagem reivindicou inteiro
 *    não vira laço — `maxLotes` segura o caso patológico, e a próxima busca já
 *    não vê as linhas reivindicadas.
 *
 * Quem busca tem de excluir o que já processou nesta passagem (a linha
 * reivindicada sai da fila; o run que falhou agora fica de fora pelo `fim_em`):
 * senão o mesmo item volta no lote seguinte.
 */
export interface DrenagemEmLotes<T> {
  tamanho:     number
  orcamentoMs: number
  buscar:      (tamanho: number) => Promise<T[]>
  /** Processa o lote e devolve quantos ESTA passagem levou. */
  processar:   (lote: T[]) => Promise<number>
  /** Teto de lotes por passagem (padrão: 200). */
  maxLotes?:   number
  /** Costura do teste. */
  relogio?:    () => number
}

export interface ResultadoDaDrenagem {
  processados:   number
  lotes:         number
  esgotouOTempo: boolean
}

export async function drenarEmLotes<T>(d: DrenagemEmLotes<T>): Promise<ResultadoDaDrenagem> {
  const agora = d.relogio ?? Date.now
  const prazo = agora() + d.orcamentoMs
  const maxLotes = d.maxLotes ?? 200
  let processados = 0
  let lotes = 0

  while (lotes < maxLotes) {
    if (agora() >= prazo) return { processados, lotes, esgotouOTempo: true }
    const lote = await d.buscar(d.tamanho)
    if (!lote.length) break
    lotes++
    processados += await d.processar(lote)
    if (lote.length < d.tamanho) break
  }
  return { processados, lotes, esgotouOTempo: false }
}
