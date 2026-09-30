import { formatBRL, formatDate } from '@estetica-os/utils'

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
  | { forma: 'AVISTA';    metodo: string }
  | { forma: 'PARCELADO'; metodo: string; entrada: number; parcelas: number; primeiroVencimento: string }
  /** Vencimento opcional: "a receber" sem data combinada é válido. */
  | { forma: 'A_RECEBER'; metodo: string | null; vencimento: string | null }

/** A linha do tempo do atendimento: curta, com o método como a tela o guarda. */
export function rotuloDoPagamento(p: PagamentoDoPlano | null): string {
  if (!p)                      return 'em aberto, a receber no atendimento'
  if (p.forma === 'AVISTA')    return `${p.metodo} à vista`
  if (p.forma === 'A_RECEBER') return 'a receber'
  const entrada = p.entrada > 0
    ? `entrada de R$ ${p.entrada.toFixed(2).replace('.', ',')} + `
    : ''
  return `${entrada}${p.parcelas}x em ${p.metodo}`
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

/** Para a TELA: o combinado numa frase curta, com o meio de pagamento por extenso. */
export function frasesDoPagamento(p: PagamentoDoPlano | null, desconto = 0): string {
  const comDesconto = desconto > 0 ? ` · desconto de ${formatBRL(desconto)}` : ''
  return fraseSemDesconto(p) + comDesconto
}

function fraseSemDesconto(p: PagamentoDoPlano | null): string {
  if (!p) return 'No atendimento'
  if (p.forma === 'AVISTA') return `À vista, ${metodo(p.metodo)}`
  if (p.forma === 'A_RECEBER') return `A receber${p.vencimento ? ` em ${formatDate(p.vencimento)}` : ''}${p.metodo ? `, ${metodo(p.metodo)}` : ''}`
  const entrada = p.entrada > 0 ? `entrada de ${formatBRL(p.entrada)} + ` : ''
  return `${entrada}${p.parcelas}x ${metodo(p.metodo)}, a primeira em ${formatDate(p.primeiroVencimento)}`.replace(/^./, c => c.toUpperCase())
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

function valoresSemDesconto(p: PagamentoDoPlano | null, total: number): Record<string, string | null> {
  const vazio = {
    'pagamento.metodo': null, 'pagamento.entrada': null, 'pagamento.parcelas': null,
    'pagamento.valor_parcela': null, 'pagamento.primeiro_vencimento': null,
  }
  if (!p) {
    return { ...vazio, 'pagamento.forma': `${formatBRL(total)}, a receber no atendimento` }
  }
  if (p.forma === 'AVISTA') {
    return { ...vazio, 'pagamento.metodo': metodo(p.metodo), 'pagamento.forma': `${formatBRL(total)} à vista, ${metodo(p.metodo)}` }
  }
  if (p.forma === 'A_RECEBER') {
    const m = metodo(p.metodo)
    return {
      ...vazio,
      'pagamento.metodo': m,
      'pagamento.primeiro_vencimento': p.vencimento ? formatDate(p.vencimento) : null,
      'pagamento.forma': `${formatBRL(total)} a receber${p.vencimento ? ` em ${formatDate(p.vencimento)}` : ''}${m ? `, ${m}` : ''}`,
    }
  }
  const saldo = centavos(total - p.entrada)
  const parcela = p.parcelas > 0 ? centavos(saldo / p.parcelas) : saldo
  const parcelas = `${p.parcelas} parcela${p.parcelas > 1 ? 's' : ''} de ${formatBRL(parcela)} ${metodo(p.metodo)}, a primeira em ${formatDate(p.primeiroVencimento)}`
  return {
    'pagamento.metodo':              metodo(p.metodo),
    'pagamento.entrada':             p.entrada > 0 ? formatBRL(p.entrada) : null,
    'pagamento.parcelas':            String(p.parcelas),
    'pagamento.valor_parcela':       formatBRL(parcela),
    'pagamento.primeiro_vencimento': formatDate(p.primeiroVencimento),
    'pagamento.forma':               p.entrada > 0 ? `entrada de ${formatBRL(p.entrada)} + ${parcelas}` : parcelas,
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
  if (p.forma === 'AVISTA') return { forma: 'AVISTA', metodo: p.metodo }
  if (p.forma === 'A_RECEBER') return { forma: 'A_RECEBER', metodo: p.metodo ?? null, vencimento: p.vencimento ? dia(p.vencimento) : null }
  return {
    forma: 'PARCELADO', metodo: p.metodo, entrada: centavos(p.entrada),
    parcelas: p.parcelas, primeiroVencimento: dia(p.primeiroVencimento),
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
    case 'AVISTA':    return { forma: 'AVISTA', metodo: String(r.metodo) }
    case 'A_RECEBER': return { forma: 'A_RECEBER', metodo: (r.metodo as string | null) ?? null, vencimento: r.vencimento ? dia(r.vencimento) : null }
    case 'PARCELADO': return {
      forma: 'PARCELADO', metodo: String(r.metodo), entrada: Number(r.entrada) || 0,
      parcelas: Number(r.parcelas) || 1, primeiroVencimento: dia(r.primeiroVencimento),
    }
    default:          return null
  }
}

export function mesmoPagamento(a: unknown, b: Record<string, string | number | null>): boolean {
  if (!a || typeof a !== 'object') return false
  const ordenar = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]))
  return ordenar(a as Record<string, unknown>) === ordenar(b)
}
