import { describe, it, expect } from 'vitest'
import { valoresCobrados } from '@/lib/appointments/valor-cobrado'

/**
 * D4 da 34ª simulação (princípio 3; D8 da 7ª: o valor do atendimento é o
 * cobrado): no app, o cartão da Agenda de um atendimento em crediário (entrada
 * de R$ 90 paga + uma parcela de R$ 100 em aberto) mostrava R$ 90 — só o que já
 * entrou. O cobrado é a soma dos lançamentos VIVOS da venda, pagos ou em aberto
 * (a mesma régua do "já cobrado" de `confirmar_pagamento_do_atendimento`: fora
 * o estornado, o estorno e a reserva sem nota do concluído sem pagar).
 */

type Linha = Record<string, unknown>
function adminFalso(linhas: Linha[]) {
  return {
    from: () => {
      const filtros: [string, string, unknown][] = []
      const cadeia: Record<string, unknown> = {}
      cadeia.select = () => cadeia
      cadeia.eq = (c: string, v: unknown) => { filtros.push(['eq', c, v]); return cadeia }
      cadeia.in = (c: string, v: unknown) => { filtros.push(['in', c, v]); return cadeia }
      cadeia.is = (c: string, v: unknown) => { filtros.push(['eq', c, v]); return cadeia }
      cadeia.then = (ok: (r: { data: unknown; error: null }) => unknown) => ok({
        data: linhas.filter(l => filtros.every(([op, c, v]) =>
          op === 'in' ? (v as unknown[]).includes(l[c]) : (l[c] ?? null) === v)),
        error: null,
      })
      return cadeia
    },
  } as never
}

const base = { appointment_id: 'a1', type: 'INCOME', loyalty_discount: 0, sale_discount: 0, category: 'Serviços', estorno_de: null }

describe('o valor cobrado do atendimento no app', () => {
  it('no crediário, é a entrada paga mais as parcelas em aberto', async () => {
    const admin = adminFalso([
      { ...base, amount: 90, is_paid: true, notes: 'Entrada — Atendimento' },
      { ...base, amount: 100, is_paid: false, notes: 'Parcela 1/1 — Atendimento' },
    ])
    const v = await valoresCobrados(admin, ['a1'])
    expect(v.get('a1')?.cobrado).toBe(190)
  })

  it('o estornado e o estorno não contam', async () => {
    const admin = adminFalso([
      { ...base, amount: 190, is_paid: true, notes: 'Estornada' },
      { ...base, amount: -190, is_paid: true, notes: null, category: 'Estorno', estorno_de: 'x' },
      { ...base, amount: 190, is_paid: true, notes: null },
    ])
    const v = await valoresCobrados(admin, ['a1'])
    expect(v.get('a1')?.cobrado).toBe(190)
  })

  it('a reserva do concluído sem pagar (em aberto, sem nota) não é cobrança', async () => {
    const admin = adminFalso([{ ...base, amount: 190, is_paid: false, notes: null }])
    const v = await valoresCobrados(admin, ['a1'])
    expect(v.get('a1')).toBeUndefined()
  })

  it('o desconto comercial, gravado uma vez, sai uma vez', async () => {
    const admin = adminFalso([
      { ...base, amount: 50, is_paid: true, notes: 'Entrada — Atendimento', sale_discount: 20 },
      { ...base, amount: 120, is_paid: false, notes: 'Parcela 1/1 — Atendimento' },
    ])
    const v = await valoresCobrados(admin, ['a1'])
    expect(v.get('a1')).toEqual({ cobrado: 170, desconto: 20 })
  })
})
