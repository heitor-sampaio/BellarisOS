import { formatBRL, formatDate } from '@estetica-os/utils'
import { rotuloDaForma } from '@/lib/financeiro/formas'
import { dividirEmParcelas } from '@/lib/checkout/parcelas'
import { parcelasEmTexto } from '@/lib/checkout/resumo-do-pagamento'

/**
 * Como o plano foi pago — e as três leituras dele que o sistema faz.
 *
 * `entrada` só existe em `PARCELADO`, e vale 0 quando não houve entrada. As
 * parcelas são o SALDO (total − entrada) dividido em `parcelas` vezes, a partir
 * de `primeiroVencimento`. `null` = nada agora: o valor fica em aberto e é
 * recebido no atendimento.
 *
 * Fora de `actions/` de propósito: todo export de um arquivo `'use server'` é
 * endpoint público, e isto é regra de texto.
 */
export type PagamentoDoPlano =
  /**
   * `vezes` só no cartão de crédito (2026-10-20): a maquininha paga a clínica,
   * então para o cliente é PAGO na hora — "entrada + parcelas" é o crediário da
   * própria clínica, cada parcela a receber. 1 (ou ausente) é o à vista de sempre.
   */
  | {
      forma: 'AVISTA'; metodo: string; vezes?: number; bandeira?: string; maquininha?: string
      /**
       * D1 da 18ª ("+ Outra forma", o Heitor, 2026-11-16): com `outras`, o
       * pagamento se divide — `valor` é o da PRIMEIRA forma (a de cima), e cada
       * outra traz o seu. A soma fecha o total (o servidor confere). Sem
       * `outras`, a primeira é o total, como sempre.
       */
      valor?: number; outras?: ParteDoPagamento[]
    }
  /**
   * `metodo`, `vezes` e `bandeira` são da ENTRADA, paga agora (D5 da 6ª
   * simulação: a entrada no crédito também em N vezes na maquininha). As
   * parcelas do saldo são o CREDIÁRIO da clínica: nascem sem meio, que se
   * escolhe ao receber (D6 — não são cartão). PDV8: sem entrada, nenhum meio
   * (nulo) — o Crediário é a forma, e nada se recebe agora.
   */
  | { forma: 'PARCELADO'; metodo?: string | null; entrada: number; parcelas: number; primeiroVencimento: string; bandeira?: string; vezes?: number; maquininha?: string }
  /**
   * Vencimento opcional: "a receber" sem data combinada é válido. PDV8: sem
   * meio — a forma se escolhe quando o dinheiro entra. O `metodo` só existe no
   * retrato de antes (o contrato assinado com "A receber, no Pix").
   */
  | { forma: 'A_RECEBER'; metodo?: string | null; vencimento: string | null }

/** Uma das formas de um pagamento dividido (D1 da 18ª): o meio, o valor e o cartão dela. */
export interface ParteDoPagamento { metodo: string; valor: number; vezes?: number; bandeira?: string; maquininha?: string }

/**
 * As partes pagas AGORA, cada uma com o seu valor: o à vista (a primeira e as
 * outras) ou a entrada do crediário. `total` é o do à vista sem divisão (a
 * primeira forma é o total). Vazio quando nada se paga agora.
 */
export function partesQuePagamAgora(p: PagamentoDoPlano | null | undefined, total?: number): (ParteDoPagamento & { vezes: number })[] {
  if (!p || p.forma === 'A_RECEBER') return []
  if (p.forma === 'PARCELADO') {
    return p.entrada > 0 && p.metodo
      ? [{ metodo: p.metodo, valor: p.entrada, vezes: vezesNoCartao(p), ...(p.bandeira ? { bandeira: p.bandeira } : {}), ...(p.maquininha ? { maquininha: p.maquininha } : {}) }]
      : []
  }
  const outras = p.outras ?? []
  const primeira = {
    metodo: p.metodo, valor: outras.length ? Number(p.valor ?? 0) : Number(total ?? p.valor ?? 0), vezes: vezesNoCartao(p),
    ...(p.bandeira ? { bandeira: p.bandeira } : {}), ...(p.maquininha ? { maquininha: p.maquininha } : {}),
  }
  return [primeira, ...outras.map(o => ({
    ...o, vezes: o.metodo === 'CREDIT_CARD' ? Math.max(1, Math.min(12, Math.round(Number(o.vezes) || 1))) : 1,
  }))]
}

/** O pagamento à vista dividido em mais de uma forma? */
export const temOutrasFormas = (p: PagamentoDoPlano | null | undefined): p is Extract<PagamentoDoPlano, { forma: 'AVISTA' }> & { outras: ParteDoPagamento[] } =>
  !!p && p.forma === 'AVISTA' && (p.outras?.length ?? 0) > 0

/**
 * A linha do tempo do atendimento: curta, com a forma pelo nome da tela
 * (`rotuloDaForma` — D18, 2026-10-29: dizia "3x em CREDIT_CARD").
 */
export function rotuloDoPagamento(p: PagamentoDoPlano | null): string {
  if (!p)                      return 'em aberto, a receber no atendimento'
  // D1 da 18ª: dividido, cada forma com o valor dela ("Crédito 3x R$ 1.000,00 + Pix R$ 596,00").
  if (temOutrasFormas(p))      return partesQuePagamAgora(p).map(x => `${rotuloDaForma(x.metodo, x.vezes)} ${formatBRL(x.valor)}`).join(' + ')
  if (p.forma === 'AVISTA')    return vezesNoCartao(p) > 1 ? rotuloDaForma(p.metodo, vezesNoCartao(p)) : `${rotuloDaForma(p.metodo)} à vista`
  if (p.forma === 'A_RECEBER') return 'a receber'
  // D6: as parcelas são com a CLÍNICA; o meio é só o da entrada.
  const entrada = p.entrada > 0
    ? `entrada de ${formatBRL(p.entrada).replace(/\s/g, ' ')} em ${rotuloDaForma(p.metodo, vezesNoCartao(p))} + `
    : ''
  return `${entrada}${p.parcelas}x no crediário`
}

const METODO: Record<string, string> = {
  PIX:             'no Pix',
  CASH:            'em dinheiro',
  DEBIT_CARD:      'no cartão de débito',
  CREDIT_CARD:     'no cartão de crédito',
  INTERNAL_CREDIT: 'com crédito interno',
}
const metodo = (m: string | null | undefined) => (m ? METODO[m] ?? `em ${m}` : null)

const centavos = (v: number) => Math.round(v * 100) / 100

/**
 * O valor da parcela como será GRAVADO (D2 da 7ª simulação): a divisão de
 * `dividirEmParcelas` (centavos, a sobra na última) — "R$ 1.700,00", ou
 * "R$ 890,66 (a última, R$ 890,68)". Era a média arredondada (890,67).
 */
function valorDaParcela(valores: number[]): string {
  const primeira = valores[0] ?? 0
  const ultima = valores[valores.length - 1] ?? 0
  return Math.abs(ultima - primeira) < 0.005 ? formatBRL(primeira) : `${formatBRL(primeira)} (a última, ${formatBRL(ultima)})`
}

/** "R$ 890,66 em 05/12/2026, R$ 890,66 em 05/01/2027 e R$ 890,68 em 05/02/2027" (A42). */
function listaDasParcelas(parcelas: { amount: number; due_date: string }[]): string {
  const itens = parcelas.map(x => `${formatBRL(x.amount)} em ${formatDate(x.due_date)}`)
  return itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}` : (itens[0] ?? '')
}

/**
 * As vezes na maquininha do que é pago AGORA no cartão de crédito: o à vista,
 * ou a entrada do "entrada + parcelas" (D5); 1 em qualquer outro caso.
 */
export function vezesNoCartao(p: PagamentoDoPlano | null | undefined): number {
  if (!p || p.metodo !== 'CREDIT_CARD') return 1
  if (p.forma === 'PARCELADO' && !(p.entrada > 0)) return 1
  if (p.forma !== 'AVISTA' && p.forma !== 'PARCELADO') return 1
  return Math.max(1, Math.min(12, Math.round(Number(p.vezes) || 1)))
}

/** O meio do que é pago AGORA (à vista, ou a entrada do "entrada + parcelas"), ou nulo. */
export function metodoQuePagaAgora(p: PagamentoDoPlano | null | undefined): string | null {
  if (!p || (p.forma !== 'AVISTA' && p.forma !== 'PARCELADO')) return null
  if (p.forma === 'PARCELADO' && !(p.entrada > 0)) return null
  return p.metodo || null
}

/** C75: a maquininha do que é pago agora no cartão (à vista ou a entrada), ou nula. */
export function maquininhaDoPagamento(p: PagamentoDoPlano | null | undefined): string | null {
  if (!p || (p.metodo !== 'CREDIT_CARD' && p.metodo !== 'DEBIT_CARD')) return null
  if (p.forma !== 'AVISTA' && p.forma !== 'PARCELADO') return null
  return p.maquininha || null
}

/** "no cartão de crédito em 3x", "no Pix" — o meio da entrada (D5). */
function meioDaEntrada(p: PagamentoDoPlano): string | null {
  const m = metodo(p.metodo)
  const vezes = vezesNoCartao(p)
  return m && vezes > 1 ? `${m} em ${vezes}x` : m
}

/** Para a TELA: o combinado numa frase curta, com o meio de pagamento por extenso. */
export function frasesDoPagamento(p: PagamentoDoPlano | null, desconto = 0): string {
  const comDesconto = desconto > 0 ? ` · desconto de ${formatBRL(desconto)}` : ''
  return fraseSemDesconto(p) + comDesconto
}

function fraseSemDesconto(p: PagamentoDoPlano | null): string {
  if (!p) return 'No atendimento'
  if (temOutrasFormas(p)) return `À vista: ${formasPorExtenso(p)}`
  if (p.forma === 'AVISTA') return vezesNoCartao(p) > 1 ? `No cartão de crédito em ${vezesNoCartao(p)}x` : `À vista, ${metodo(p.metodo)}`
  if (p.forma === 'A_RECEBER') return `A receber${p.vencimento ? ` em ${formatDate(p.vencimento)}` : ''}${p.metodo ? `, ${metodo(p.metodo)}` : ''}`
  // D6: as parcelas são o crediário da clínica; o meio é o da entrada.
  const entrada = p.entrada > 0 ? `entrada de ${formatBRL(p.entrada)} ${meioDaEntrada(p)} + ` : ''
  return `${entrada}${p.parcelas}x no crediário, a primeira em ${formatDate(p.primeiroVencimento)}`.replace(/^./, c => c.toUpperCase())
}

/**
 * O que o CONTRATO diz do pagamento: a frase inteira (`pagamento.forma`, que
 * sempre tem valor) e as peças para quem monta o texto à mão.
 *
 * `total` é o valor ANTES do desconto; a frase fala do que o cliente paga (o
 * total menos o desconto) e, havendo desconto, diz de quanto foi e sobre quê.
 */
export function valoresDoPagamento(p: PagamentoDoPlano | null, total: number, desconto = 0): Record<string, string | null> {
  const d = centavos(Math.max(0, Math.min(desconto, total)))
  const valores = valoresSemDesconto(p, centavos(total - d))
  return {
    ...valores,
    'pagamento.subtotal': formatBRL(total),
    'pagamento.desconto': d > 0 ? formatBRL(d) : null,
    'pagamento.forma':    d > 0
      ? `${valores['pagamento.forma']}, com desconto de ${formatBRL(d)} sobre ${formatBRL(total)}`
      : valores['pagamento.forma']!,
  }
}

/** "R$ 1.000,00 no cartão de crédito em 3x + R$ 596,00 no Pix" (D1 da 18ª). */
function formasPorExtenso(p: PagamentoDoPlano): string {
  return partesQuePagamAgora(p).map(x => {
    const m = metodo(x.metodo)
    return `${formatBRL(x.valor)} ${m && x.vezes > 1 ? `${m} em ${x.vezes}x` : m}`
  }).join(' + ')
}

function valoresSemDesconto(p: PagamentoDoPlano | null, total: number): Record<string, string | null> {
  const vazio = {
    'pagamento.metodo': null, 'pagamento.entrada': null, 'pagamento.parcelas': null,
    'pagamento.valor_parcela': null, 'pagamento.primeiro_vencimento': null,
  }
  if (!p) {
    return { ...vazio, 'pagamento.forma': `${formatBRL(total)}, a receber no atendimento` }
  }
  if (temOutrasFormas(p)) {
    const meios = partesQuePagamAgora(p).map(x => metodo(x.metodo)).filter((m, i, xs): m is string => !!m && xs.indexOf(m) === i)
    return {
      ...vazio, 'pagamento.metodo': meios.length > 1 ? `${meios.slice(0, -1).join(', ')} e ${meios[meios.length - 1]}` : meios[0] ?? null,
      'pagamento.forma': `${formatBRL(total)} à vista: ${formasPorExtenso(p)}`,
    }
  }
  if (p.forma === 'AVISTA') {
    const vezes = vezesNoCartao(p)
    if (vezes > 1) {
      return {
        ...vazio, 'pagamento.metodo': metodo(p.metodo), 'pagamento.parcelas': String(vezes),
        'pagamento.valor_parcela': valorDaParcela(dividirEmParcelas(total, vezes, '2026-01-01').map(x => x.amount)),
        'pagamento.forma': `${formatBRL(total)} ${metodo(p.metodo)} em ${vezes}x`,
      }
    }
    return { ...vazio, 'pagamento.metodo': metodo(p.metodo), 'pagamento.forma': `${formatBRL(total)} à vista, ${metodo(p.metodo)}` }
  }
  if (p.forma === 'A_RECEBER') {
    const m = metodo(p.metodo)
    return {
      ...vazio,
      // PDV8: o a receber não tem meio (o retrato de antes ainda pode ter).
      'pagamento.metodo': m ?? 'a receber',
      'pagamento.primeiro_vencimento': p.vencimento ? formatDate(p.vencimento) : null,
      'pagamento.forma': `${formatBRL(total)} a receber${p.vencimento ? ` em ${formatDate(p.vencimento)}` : ''}${m ? `, ${m}` : ''}`,
    }
  }
  const saldo = centavos(total - p.entrada)
  // D2/A42 da 7ª simulação: as parcelas GRAVADAS (`dividirEmParcelas`, a mesma
  // conta dos lançamentos), cada uma com o valor e a data. Era a média
  // arredondada ("3 parcelas de R$ 890,67"), que não somava o saldo.
  const gravadas = dividirEmParcelas(saldo, Math.max(1, p.parcelas), p.primeiroVencimento)
  const valores = gravadas.map(x => x.amount)
  const iguais = valorDaParcela(valores) === formatBRL(valores[0] ?? 0)
  const quanto = iguais ? `de ${formatBRL(valores[0] ?? 0)}` : `(${parcelasEmTexto(saldo, gravadas.length)})`
  // D6: o saldo é o crediário da CLÍNICA — não vai "no cartão de crédito".
  // A39 da 8ª: com a lista, a data de cada uma já está nela — "a primeira em
  // 06/12/2026" antes dela repetia a data ("…a primeira em 06/12/2026: R$ 750,00
  // em 06/12/2026 e…"). Uma só diz o vencimento dela.
  const parcelas = gravadas.length > 1
    ? `${gravadas.length} parcelas ${quanto} no crediário: ${listaDasParcelas(gravadas)}`
    : `1 parcela ${quanto} no crediário, com vencimento em ${formatDate(p.primeiroVencimento)}`
  return {
    // PDV8: a forma é o crediário (nunca vazia); com entrada, diz o meio dela.
    'pagamento.metodo':              p.entrada > 0 && meioDaEntrada(p) ? `no crediário, com a entrada ${meioDaEntrada(p)}` : 'no crediário',
    'pagamento.entrada':             p.entrada > 0 ? formatBRL(p.entrada) : null,
    'pagamento.parcelas':            String(p.parcelas),
    'pagamento.valor_parcela':       valorDaParcela(valores),
    'pagamento.primeiro_vencimento': formatDate(p.primeiroVencimento),
    'pagamento.forma':               p.entrada > 0 ? `entrada de ${formatBRL(p.entrada)} ${meioDaEntrada(p)} + ${parcelas}` : parcelas,
  }
}

/**
 * A forma estável do pagamento, para guardar junto do contrato e comparar
 * depois: o cliente assinou ESTE pagamento, e o checkout só lança ele.
 * Valores em centavos, datas só no dia (o horário que a tela monta não é
 * dado do contrato), e "nada agora" explícito.
 *
 * O desconto (em reais) faz parte do combinado: trocá-lo depois de assinar
 * substitui o contrato, como trocar a forma. Só entra quando existe — os
 * retratos de antes do desconto seguem iguais aos de agora sem desconto.
 */
export function pagamentoNormalizado(p: PagamentoDoPlano | null, desconto = 0): Record<string, string | number | null> {
  const base = normalizadoSemDesconto(p)
  return desconto > 0 ? { ...base, desconto: centavos(desconto) } : base
}

function normalizadoSemDesconto(p: PagamentoDoPlano | null): Record<string, string | number | null> {
  const dia = (iso: string) => iso.slice(0, 10)
  if (!p) return { forma: 'NADA_AGORA' }
  // As vezes só entram quando passam de 1: o retrato do à vista de antes segue igual.
  if (p.forma === 'AVISTA') {
    const base: Record<string, string | number | null> = vezesNoCartao(p) > 1 ? { forma: 'AVISTA', metodo: p.metodo, vezes: vezesNoCartao(p) } : { forma: 'AVISTA', metodo: p.metodo }
    // D1 da 18ª: as outras formas entram só quando existem (o retrato de antes segue igual), em centavos.
    if (!temOutrasFormas(p)) return base
    return {
      ...base, valor: Math.round(Number(p.valor ?? 0) * 100),
      outras: JSON.stringify(p.outras.map(o => ({ metodo: o.metodo, valor: Math.round(o.valor * 100), ...(o.metodo === 'CREDIT_CARD' && Number(o.vezes) > 1 ? { vezes: Number(o.vezes) } : {}) }))),
    }
  }
  if (p.forma === 'A_RECEBER') return { forma: 'A_RECEBER', metodo: p.metodo ?? null, vencimento: p.vencimento ? dia(p.vencimento) : null }
  return {
    forma: 'PARCELADO', metodo: p.metodo || null, entrada: centavos(p.entrada),
    parcelas: p.parcelas, primeiroVencimento: dia(p.primeiroVencimento),
    // D5: as vezes da entrada só entram quando passam de 1 (o retrato de antes segue igual).
    ...(vezesNoCartao(p) > 1 ? { vezes: vezesNoCartao(p) } : {}),
  }
}

/** O desconto guardado no retrato, em reais (0 = sem desconto). */
export function descontoDoRetrato(retrato: unknown): number {
  const v = Number((retrato as Record<string, unknown> | null)?.desconto)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * O retrato guardado → o pagamento de novo, para montar o texto outra vez fora
 * do checkout. As datas ganham o meio-dia de Brasília: `2026-10-10` puro seria
 * meia-noite UTC, e no fuso da clínica viraria o dia 9.
 */
export function pagamentoDoRetrato(retrato: unknown): PagamentoDoPlano | null {
  const r = (retrato ?? {}) as Record<string, unknown>
  const dia = (d: unknown) => new Date(`${String(d)}T12:00:00-03:00`).toISOString()
  switch (r.forma) {
    case 'AVISTA': {
      const base: PagamentoDoPlano = Number(r.vezes) > 1
        ? { forma: 'AVISTA', metodo: String(r.metodo), vezes: Number(r.vezes) }
        : { forma: 'AVISTA', metodo: String(r.metodo) }
      // D1 da 18ª: o retrato dividido guarda as outras formas (em centavos).
      const outras = (() => { try { return typeof r.outras === 'string' ? JSON.parse(r.outras) as { metodo: string; valor: number; vezes?: number }[] : null } catch { return null } })()
      if (!outras?.length) return base
      return { ...base, valor: Number(r.valor) / 100, outras: outras.map(o => ({ metodo: o.metodo, valor: o.valor / 100, ...(o.vezes ? { vezes: o.vezes } : {}) })) }
    }
    case 'A_RECEBER': return { forma: 'A_RECEBER', metodo: (r.metodo as string | null) ?? null, vencimento: r.vencimento ? dia(r.vencimento) : null }
    case 'PARCELADO': return {
      forma: 'PARCELADO', metodo: (r.metodo as string | null) || null, entrada: Number(r.entrada) || 0,
      parcelas: Number(r.parcelas) || 1, primeiroVencimento: dia(r.primeiroVencimento),
      ...(Number(r.vezes) > 1 ? { vezes: Number(r.vezes) } : {}),
    }
    default:          return null
  }
}

export function mesmoPagamento(a: unknown, b: Record<string, string | number | null>): boolean {
  if (!a || typeof a !== 'object') return false
  const ordenar = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]))
  return ordenar(a as Record<string, unknown>) === ordenar(b)
}
