import { describe, it, expect } from 'vitest'
import { separarOEmAberto } from '@/lib/checkout/em-aberto-do-plano'

// 20/10/2026, 15h em Brasília.
const agora = new Date('2026-10-20T18:00:00Z')
const l = (id: string, amount: number, is_paid: boolean, due_date: string | null) => ({ id, amount, is_paid, due_date })

describe('o que o check-in cobra de um plano', () => {
  it('aceito sem cobrança (sem data): tudo em aberto, a cobrar agora', () => {
    expect(separarOEmAberto([l('a', 600, false, null)], agora)).toMatchObject({ emAberto: 600, aVencer: 0, pendentes: ['a'] })
  })
  it('parcelas que vencem depois NÃO se cobram de novo: só informam', () => {
    const r = separarOEmAberto([
      l('e', 100, true, null),
      l('p1', 100, false, '2026-11-20T15:00:00Z'),
      l('p2', 100, false, '2026-12-20T15:00:00Z'),
    ], agora)
    expect(r).toMatchObject({ emAberto: 0, aVencer: 200, recebido: 100, pendentes: [], proximoVencimento: '2026-11-20T15:00:00Z' })
  })
  it('a parcela que vence HOJE (até o fim do dia em Brasília) ou já venceu se cobra', () => {
    const r = separarOEmAberto([
      l('hoje', 100, false, '2026-10-21T02:30:00Z'), // 20/10, 23h30 em Brasília
      l('amanha', 100, false, '2026-10-21T03:30:00Z'), // 21/10, 0h30
      l('ontem', 50, false, '2026-10-19T15:00:00Z'),
    ], agora)
    expect(r).toMatchObject({ emAberto: 150, aVencer: 100, pendentes: ['hoje', 'ontem'] })
  })
  it('lançamento zerado é histórico: fora da conta', () => {
    expect(separarOEmAberto([l('z', 0, false, null)], agora)).toMatchObject({ emAberto: 0, pendentes: [] })
  })
})
