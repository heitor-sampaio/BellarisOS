import { z } from 'zod'
import { formatBRL } from '@estetica-os/utils'

/**
 * O desconto de uma venda (decisão do Heitor, 2026-09-30): toda venda aceita
 * desconto — pacote, procedimento pré-pago, checkout do plano e o pagamento do
 * atendimento na recepção —, sem teto, e fica registrado quem deu.
 *
 * A pessoa escolhe em R$ ou em %; o que vai para o banco é sempre o valor em
 * REAIS, calculado aqui em centavos inteiros. É ele que o contrato cita, o
 * lançamento registra e a comissão desconta da base — a mesma conta em todo
 * lugar, e nenhuma na tela.
 *
 * Fora de `actions/`: todo export de um arquivo `'use server'` é endpoint.
 */
export type Desconto = { tipo: 'VALOR' | 'PERCENTUAL'; valor: number }

/** Como chega do navegador. Nulo = sem desconto. */
export const EntradaDoDesconto = z.object({
  tipo:  z.enum(['VALOR', 'PERCENTUAL']),
  valor: z.number().finite().min(0),
}).nullable().optional()

const emCentavos = (v: number) => Math.round(v * 100)

/**
 * O desconto em reais sobre `total`, em centavos: nunca negativo, nunca maior
 * que o total. Percentual acima de 100 é recusado por quem valida a entrada;
 * aqui só se garante que a conta não sai do intervalo.
 */
export function descontoEmReais(total: number, d: Desconto | null | undefined): number {
  if (!d || !(d.valor > 0) || !(total > 0)) return 0
  const t = emCentavos(total)
  const c = d.tipo === 'PERCENTUAL' ? Math.round(t * Math.min(d.valor, 100) / 100) : emCentavos(d.valor)
  return Math.min(Math.max(c, 0), t) / 100
}

/** A recusa do desconto, ou null — o que a action devolve antes de gravar. */
export function recusaDoDesconto(total: number, d: Desconto | null | undefined): string | null {
  if (!d || !(d.valor > 0)) return null
  if (d.tipo === 'PERCENTUAL' && d.valor > 100) return 'O desconto não pode passar de 100%.'
  if (d.tipo === 'VALOR' && emCentavos(d.valor) > emCentavos(total)) return 'O desconto não pode ser maior que o valor da venda.'
  return null
}

/**
 * Reparte `alvo` entre as partes na proporção de cada uma, em centavos, e a
 * soma fecha exatamente. É o rateio do desconto do plano pelos procedimentos.
 *
 * Maior resto, não "a última leva a sobra": cada parte fica no piso ou no teto
 * da sua proporção, então com `alvo` ≤ soma nenhuma passa do próprio valor —
 * com a sobra toda na última, um desconto de um centavo podia deixá-la acima
 * do preço de tabela. O desempate é pela ordem, para a conta ser a mesma
 * sempre.
 */
export function ratear(partes: number[], alvo: number): number[] {
  const cents = partes.map(emCentavos)
  const soma = cents.reduce((s, c) => s + c, 0)
  const alvoC = emCentavos(alvo)
  if (!cents.length) return []
  if (soma <= 0) {
    // Tudo zerado: não há proporção. O alvo vai para a última parte.
    return cents.map((_, i) => (i === cents.length - 1 ? alvoC : 0) / 100)
  }
  const exatos = cents.map(c => c * alvoC / soma)
  const pisos = exatos.map(Math.floor)
  let falta = alvoC - pisos.reduce((s, p) => s + p, 0)
  const ordem = exatos.map((e, i) => ({ i, resto: e - pisos[i]! }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i)
  for (const { i } of ordem) {
    if (falta <= 0) break
    pisos[i]! += 1
    falta -= 1
  }
  return pisos.map(p => p / 100)
}

/** "10% (R$ 40,00)" ou "R$ 40,00" — para a linha do tempo e as telas. */
export function rotuloDoDesconto(reais: number, d?: Desconto | null): string {
  if (d?.tipo === 'PERCENTUAL') return `${String(d.valor).replace('.', ',')}% (${formatBRL(reais)})`
  return formatBRL(reais)
}
