/**
 * A conferência do Fechamento do dia, uma linha por forma de pagamento (CX4
 * do plano de adaptação — a revisão do Heitor, 2026-11-13): o que o sistema
 * REGISTROU × o que a pessoa CONFERIU × a diferença.
 *
 * - Dinheiro: o registrado é o esperado na gaveta (o fundo de troco + o saldo
 *   em espécie do dia — `esperadoDinheiro`, de lib/metrics); o conferido, o
 *   `contado_dinheiro`; a diferença, a coluna gerada do banco. Obrigatório.
 * - As outras formas: o registrado é o saldo do dia daquela forma (entradas −
 *   saídas, de lib/metrics); o conferido é OPCIONAL — em branco é "não
 *   conferido" (princípio 4: nunca se supõe que bateu). A diferença é contra o
 *   retrato do MESMO fechamento (o `resumo` guardado), em centavos.
 * - "Sem forma" (os pontos, a despesa sem meio) não se confere: não é dinheiro
 *   de gaveta nem de extrato.
 *
 * Puro (sem banco): o servidor monta as linhas, a tela só as desenha.
 */

/** As chaves de forma que não se conferem. */
export const FORMAS_SEM_CONFERENCIA = ['PONTOS', 'SEM_FORMA'] as const

/** A chave de uma linha do fechamento: CASH, PIX, DEBIT_CARD, CREDIT_CARD:3… */
export const CHAVE_DE_FORMA = /^[A-Z_]{2,30}(:\d{1,2})?$/

/** A forma se confere (fora o dinheiro, que tem o campo próprio)? */
export function formaConferivel(forma: string): boolean {
  return forma !== 'CASH' && !(FORMAS_SEM_CONFERENCIA as readonly string[]).includes(forma) && CHAVE_DE_FORMA.test(forma)
}

export interface LinhaRegistrada { forma: string; entradas: number; saidas: number; saldo: number }

export interface FechamentoGravado {
  contado:   number
  /** A diferença do dinheiro (coluna gerada do banco). */
  diferenca: number
  /** O conferido das outras formas (forma → valor); nulo = nenhuma conferida. */
  conferido: Record<string, number> | null
  /** O retrato do resumo daquele fechamento. */
  resumo:    LinhaRegistrada[] | null
}

export interface LinhaDaConferencia {
  forma:      string
  entradas:   number
  saidas:     number
  /** O que o sistema registrou: o esperado na gaveta (dinheiro) ou o saldo do dia da forma. */
  registrado: number
  /** Tem campo de conferência (o dinheiro e as formas de pagamento; não o "sem forma"). */
  conferivel: boolean
  /** O conferido no último fechamento; nulo = não conferido (ou não fechado). */
  conferido:  number | null
  /** conferido − registrado do último fechamento; nulo = não conferido (ou não fechado). */
  diferenca:  number | null
}

const centavos = (v: number) => Math.round(v * 100)

export function linhasDaConferencia(args: {
  formas:           LinhaRegistrada[]
  esperadoDinheiro: number
  ultimo:           FechamentoGravado | null
}): LinhaDaConferencia[] {
  const { formas, esperadoDinheiro, ultimo } = args
  const dinheiro = formas.find(f => f.forma === 'CASH')
  const linhas: LinhaDaConferencia[] = [{
    forma: 'CASH', entradas: dinheiro?.entradas ?? 0, saidas: dinheiro?.saidas ?? 0,
    registrado: esperadoDinheiro, conferivel: true,
    conferido: ultimo ? ultimo.contado : null,
    diferenca: ultimo ? ultimo.diferenca : null,
  }]
  const doRetrato = (forma: string) => ultimo?.resumo?.find(l => l.forma === forma)?.saldo ?? 0
  const conferidoDe = (forma: string) => {
    const v = ultimo?.conferido?.[forma]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const vistas = new Set(['CASH'])
  for (const f of formas) {
    if (vistas.has(f.forma)) continue
    vistas.add(f.forma)
    const conferivel = formaConferivel(f.forma)
    const conferido = conferivel ? conferidoDe(f.forma) : null
    linhas.push({
      forma: f.forma, entradas: f.entradas, saidas: f.saidas, registrado: f.saldo, conferivel, conferido,
      diferenca: conferido == null ? null : (centavos(conferido) - centavos(doRetrato(f.forma))) / 100,
    })
  }
  // Conferida no último fechamento e sem movimento agora (o pagamento foi
  // estornado depois): a linha fica, com o que foi conferido.
  for (const forma of Object.keys(ultimo?.conferido ?? {})) {
    if (vistas.has(forma) || !formaConferivel(forma)) continue
    vistas.add(forma)
    const conferido = conferidoDe(forma)
    linhas.push({
      forma, entradas: 0, saidas: 0, registrado: 0, conferivel: true, conferido,
      diferenca: conferido == null ? null : (centavos(conferido) - centavos(doRetrato(forma))) / 100,
    })
  }
  return linhas
}

/**
 * O conferido que chega à action: forma → valor (nulo ou ausente = não
 * conferido). Recusa forma que o dia não tem (ou que não se confere) e valor
 * negativo; devolve só as conferidas, arredondadas ao centavo.
 */
export function conferidoValido(
  entrada: unknown, formasDoDia: string[],
): { ok: true; conferido: Record<string, number> | null } | { error: string } {
  if (entrada == null) return { ok: true, conferido: null }
  if (typeof entrada !== 'object' || Array.isArray(entrada)) return { error: 'Conferência inválida.' }
  const doDia = new Set(formasDoDia.filter(formaConferivel))
  const conferido: Record<string, number> = {}
  for (const [forma, valor] of Object.entries(entrada as Record<string, unknown>)) {
    if (!formaConferivel(forma) || !doDia.has(forma)) return { error: 'Forma de pagamento que este dia não tem.' }
    if (valor == null) continue
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 10_000_000) {
      return { error: 'Informe o valor conferido (R$ 0,00 ou mais) ou deixe em branco.' }
    }
    conferido[forma] = centavos(valor) / 100
  }
  return { ok: true, conferido: Object.keys(conferido).length ? conferido : null }
}
