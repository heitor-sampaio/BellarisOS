import { parseDinheiro } from '@estetica-os/utils'

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
 * - Com movimento depois do fechamento (D2 da 17ª simulação; princípios 3 e
 *   4), o registrado de agora não é o daquele fechamento: a linha mostra o
 *   registrado de agora, o conferido de antes com o registrado de então, e a
 *   diferença fica "a conferir" — nunca "Bateu" contra um número que mudou.
 * - "Sem forma" (os pontos, a despesa sem meio) não se confere: não é dinheiro
 *   de gaveta nem de extrato. Nem a forma só com saída (A8 da 16ª): não há
 *   entrada a conferir.
 * - O saldo de uma forma pode ser NEGATIVO (D3 da 18ª: o Pix com R$ 300 de
 *   entrada e R$ 510 de saída): o conferido dela também pode — é o saldo do
 *   extrato. Só o dinheiro contado na gaveta não é negativo.
 * - A forma estornada no mesmo dia (A4 da 18ª: o débito de R$ 350 estornado e
 *   recebido de novo no Pix) fica com a linha dela, com zero: a tela diz o
 *   estornado ali, em vez de a forma sumir da tabela.
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
  /** O dinheiro esperado na gaveta naquele fechamento (o retrato do registrado do dinheiro). */
  esperado?: number
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
  /**
   * conferido − registrado do último fechamento; nulo = não conferido (ou não
   * fechado) ou o registrado mudou depois dele (`mudouDepois`).
   */
  diferenca:  number | null
  /** D2 da 17ª: o registrado de agora não é o daquele fechamento (houve movimento depois). */
  mudouDepois: boolean
  /** D2 da 17ª: o registrado no último fechamento; nulo sem fechamento. */
  registradoNoFechamento: number | null
}

const centavos = (v: number) => Math.round(v * 100)

/**
 * A linha gravada em `fechamentos_do_dia` → o fechamento da conferência (D2 da
 * 21ª simulação): a tela e o CSV do fechamento leem o último fechamento do
 * mesmo jeito — o CSV dizia "Bateu" pela diferença gravada num dia que mudou.
 */
export function fechamentoGravadoDaLinha(l: {
  contado_dinheiro?: unknown; diferenca?: unknown; esperado_dinheiro?: unknown; conferido?: unknown; resumo?: unknown
}): FechamentoGravado {
  return {
    contado:   Number(l.contado_dinheiro),
    diferenca: Number(l.diferenca),
    // D2 da 17ª: o registrado do dinheiro NAQUELE fechamento.
    esperado:  l.esperado_dinheiro == null ? undefined : Number(l.esperado_dinheiro),
    conferido: (l.conferido as Record<string, number> | null | undefined) ?? null,
    resumo:    Array.isArray(l.resumo)
      ? (l.resumo as LinhaRegistrada[]).map(r => ({ ...r, entradas: Number(r.entradas), saidas: Number(r.saidas), saldo: Number(r.saldo) }))
      : null,
  }
}

export function linhasDaConferencia(args: {
  formas:           LinhaRegistrada[]
  esperadoDinheiro: number
  ultimo:           FechamentoGravado | null
  /** A4 da 18ª: o estornado HOJE de um pagamento de hoje, por forma (`estornadoNoMesmoDiaPorForma`). */
  estornadoHoje?:   Record<string, number>
}): LinhaDaConferencia[] {
  const { formas, esperadoDinheiro, ultimo, estornadoHoje = {} } = args
  const dinheiro = formas.find(f => f.forma === 'CASH')
  // O esperado daquele fechamento; o gravado antes da coluna no retrato é o contado − a diferença.
  const dinheiroNoFechamento = ultimo
    ? (ultimo.esperado ?? (centavos(ultimo.contado) - centavos(ultimo.diferenca)) / 100) : null
  const dinheiroMudou = dinheiroNoFechamento != null && centavos(dinheiroNoFechamento) !== centavos(esperadoDinheiro)
  const linhas: LinhaDaConferencia[] = [{
    forma: 'CASH', entradas: dinheiro?.entradas ?? 0, saidas: dinheiro?.saidas ?? 0,
    registrado: esperadoDinheiro, conferivel: true,
    conferido: ultimo ? ultimo.contado : null,
    diferenca: ultimo && !dinheiroMudou ? ultimo.diferenca : null,
    mudouDepois: dinheiroMudou, registradoNoFechamento: dinheiroNoFechamento,
  }]
  const doRetrato = (forma: string) => ultimo?.resumo?.find(l => l.forma === forma)?.saldo ?? 0
  // A diferença só vale contra o retrato do MESMO fechamento, e só se o registrado não mudou.
  const comparado = (forma: string, registrado: number, conferido: number | null) => {
    const noFechamento = ultimo ? doRetrato(forma) : null
    const mudou = noFechamento != null && centavos(noFechamento) !== centavos(registrado)
    return {
      mudouDepois: mudou, registradoNoFechamento: noFechamento,
      diferenca: conferido == null || mudou ? null : (centavos(conferido) - centavos(noFechamento ?? 0)) / 100,
    }
  }
  const conferidoDe = (forma: string) => {
    const v = ultimo?.conferido?.[forma]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const vistas = new Set(['CASH'])
  for (const f of formas) {
    if (vistas.has(f.forma)) continue
    vistas.add(f.forma)
    // A8 da 16ª (princípio 3): a forma só com SAÍDA (o Pix de uma despesa) não tem o que
    // conferir — não pede o campo nem fica "não conferido". A conferida antes segue com ele.
    const conferivel = formaConferivel(f.forma) && (f.entradas > 0 || conferidoDe(f.forma) != null)
    const conferido = conferivel ? conferidoDe(f.forma) : null
    linhas.push({
      forma: f.forma, entradas: f.entradas, saidas: f.saidas, registrado: f.saldo, conferivel, conferido,
      ...comparado(f.forma, f.saldo, conferido),
    })
  }
  // A4 da 18ª (princípio 3): a forma cujo pagamento de hoje foi estornado hoje
  // não tem movimento (um anula o outro), mas não some da tabela. Sem entrada,
  // não pede conferência (A8 da 16ª) — a não ser que já tenha sido conferida.
  for (const [forma, valor] of Object.entries(estornadoHoje)) {
    if (vistas.has(forma) || !formaConferivel(forma) || !(valor > 0)) continue
    vistas.add(forma)
    const conferido = conferidoDe(forma)
    linhas.push({
      forma, entradas: 0, saidas: 0, registrado: 0, conferivel: conferido != null, conferido,
      ...comparado(forma, 0, conferido),
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
      ...comparado(forma, 0, conferido),
    })
  }
  return linhas
}

/**
 * O que se moveu depois do último fechamento (A3 da 17ª simulação, princípio
 * 3): o aviso dizia "Entrou dinheiro" quando só SAIU (a comissão paga no Pix).
 * É o dia de agora contra o retrato daquele fechamento, somado em centavos:
 * mais entradas ou menos saídas é o que ENTROU; menos entradas (o estorno de um
 * pagamento do dia) ou mais saídas, o que SAIU. Os pontos não são dinheiro.
 */
export function movimentoDepoisDoFechamento(
  agora: LinhaRegistrada[], retrato: LinhaRegistrada[] | null,
): { entrou: number; saiu: number } {
  const soma = (linhas: LinhaRegistrada[] | null, campo: 'entradas' | 'saidas') =>
    (linhas ?? []).filter(l => l.forma !== 'TOTAL' && l.forma !== 'PONTOS')
      .reduce((t, l) => t + centavos(Number(l[campo]) || 0), 0)
  const entradas = soma(agora, 'entradas') - soma(retrato, 'entradas')
  const saidas = soma(agora, 'saidas') - soma(retrato, 'saidas')
  return {
    entrou: (Math.max(entradas, 0) + Math.max(-saidas, 0)) / 100,
    saiu:   (Math.max(-entradas, 0) + Math.max(saidas, 0)) / 100,
  }
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** "Houve movimento depois do fechamento das 21:23 (saiu R$ 80,00): confira e feche de novo." */
export function textoDoMovimentoDepois(m: { entrou: number; saiu: number }, fechadoAs: string): string {
  const partes = [m.entrou > 0 ? `entrou ${brl(m.entrou)}` : null, m.saiu > 0 ? `saiu ${brl(m.saiu)}` : null].filter(Boolean)
  return `Houve movimento depois do fechamento das ${fechadoAs}${partes.length ? ` (${partes.join(' e ')})` : ''}: confira e feche de novo.`
}

/**
 * O texto do campo do conferido, lido (D3 da 18ª): vazio é "não conferido"
 * (nulo); "−210,00" (o menos que a tela escreve) e "-210,00" são negativos; o
 * que não se lê é NaN, e a tela recusa.
 */
export function lerConferidoDoCampo(texto: string): number | null {
  const t = texto.trim().replace(/^[−–]/, '-')
  if (t === '') return null
  return parseDinheiro(t)
}

/**
 * A diferença enquanto se digita (A3 da 19ª simulação, 2026-11-16; princípio
 * 3): no "Fechar de novo", a linha seguia "a conferir · mudou depois do
 * fechamento" até fechar, porque a diferença vinha só do servidor. É a mesma
 * conta do fechamento — conferido − registrado, em centavos —, com o que está
 * no campo. Vazio ou ilegível: nulo (a tela mostra o que mostrava).
 */
export function diferencaAoDigitar(texto: string, registrado: number): number | null {
  const v = lerConferidoDoCampo(texto)
  if (v == null || !Number.isFinite(v)) return null
  return (Math.round(v * 100) - Math.round(registrado * 100)) / 100
}

/**
 * Os campos do "Fechar de novo" (A2 da 18ª; princípios 3 e 4): vêm com o que
 * foi conferido no último fechamento — menos a linha que mudou depois dele,
 * que vem EM BRANCO: o conferido de antes é de um registrado que já não vale,
 * e quem só clicasse fecharia com um número que a tela diz estar velho.
 */
export function valoresParaFecharDeNovo(linhas: readonly LinhaDaConferencia[]): Record<string, string> {
  const valores: Record<string, string> = {}
  for (const l of linhas) {
    if (l.conferivel && l.conferido != null && !l.mudouDepois) valores[l.forma] = l.conferido.toFixed(2).replace('.', ',')
  }
  return valores
}

/**
 * O conferido que chega à action: forma → valor (nulo ou ausente = não
 * conferido). Recusa forma que o dia não tem (ou que não se confere); o valor
 * pode ser negativo (D3 da 18ª: o saldo da forma pode ser); devolve só as
 * conferidas, arredondadas ao centavo.
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
    if (typeof valor !== 'number' || !Number.isFinite(valor) || Math.abs(valor) > 10_000_000) {
      return { error: 'Informe o valor conferido ou deixe em branco.' }
    }
    conferido[forma] = centavos(valor) / 100
  }
  return { ok: true, conferido: Object.keys(conferido).length ? conferido : null }
}

/**
 * O dinheiro que SAIU mais do que entrou (A4 da 20ª simulação; princípio 2): a
 * despesa em dinheiro com a gaveta vazia fechava em "−R$ 80,00 na gaveta" e,
 * contado 0, "Sobrou R$ 80,00" — a conta está certa, mas ninguém a entendia.
 * Não recusa (a saída é a que a rede lançou): avisa, e diz o que conferir.
 * Zero ou positivo: nulo.
 */
export function avisoDaGavetaNegativa(registrado: number): string | null {
  if (!(Math.round(registrado * 100) < 0)) return null
  // A4 da 21ª: o "a gaveta não fica negativa" ao lado do "−R$ 60,00 na gaveta" se lia como contradição.
  return `Saiu ${brl(Math.abs(registrado))} a mais do que entrou em dinheiro: confira a saída em dinheiro, ou informe o fundo de troco.`
}

/**
 * O botão que grava a conferência (A6 da 20ª; princípio 3): no "Fechar de
 * novo" ele dizia "Fechar o dia", e a Auditoria registrava "Fechou de novo".
 */
export function rotuloDoBotaoDeFechar({ reabrindo, pendente }: { reabrindo: boolean; pendente: boolean }): string {
  if (pendente) return 'Fechando…'
  return reabrindo ? 'Fechar de novo' : 'Fechar o dia'
}

/** O que a coluna Diferença da conferência mostra (A12 da 22ª). */
export type DiferencaNaTela = { tipo: 'valor'; valor: number } | { tipo: 'a-conferir' } | { tipo: 'nao-conferido' } | { tipo: 'nada' }

/**
 * A coluna Diferença de uma linha (A12 da 22ª simulação; princípio 3): no
 * "Fechar de novo", o campo em branco seguia mostrando o "Bateu" do
 * fechamento de ANTES. Conferindo, a diferença é só a do que se digita — em
 * branco, o dinheiro fica "—" (é obrigatório, falta digitar) e as outras
 * formas, "não conferido" (é o que o branco grava). Fora da conferência, a do
 * último fechamento (com o "a conferir" quando o dia mudou depois).
 */
export function diferencaNaTela(l: LinhaDaConferencia, args: { conferindo: boolean; texto: string; fechado: boolean }): DiferencaNaTela {
  if (!l.conferivel) return { tipo: 'nada' }
  if (args.conferindo) {
    const digitada = diferencaAoDigitar(args.texto, l.registrado)
    if (digitada != null) return { tipo: 'valor', valor: digitada }
    // O primeiro fechamento do dia: em branco, nada ainda. O "Fechar de novo": o branco grava "não conferido".
    return !args.fechado || l.forma === 'CASH' ? { tipo: 'nada' } : { tipo: 'nao-conferido' }
  }
  if (!args.fechado) return { tipo: 'nada' }
  if (l.mudouDepois && l.conferido != null) return { tipo: 'a-conferir' }
  if (l.diferenca == null) return { tipo: 'nao-conferido' }
  return { tipo: 'valor', valor: l.diferenca }
}
