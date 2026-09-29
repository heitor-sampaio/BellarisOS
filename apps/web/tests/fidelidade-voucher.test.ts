import { describe, it, expect } from 'vitest'
import { descontoDoVoucher, situacaoDoVoucher, descricaoDoVoucher } from '@/lib/fidelidade/voucher'
import { EntradaDaRecompensa } from '@/lib/fidelidade/recompensa'
import { saldoDepoisDaSaida } from '@/lib/estoque/baixa'

const agora  = new Date('2026-09-29T12:00:00Z')
const futuro = '2026-10-29T12:00:00Z'
const ativo = (extra: Record<string, unknown>) => ({
  type: 'DESCONTO_VALOR', status: 'ATIVO', expires_at: futuro, procedure_id: null, discount_value: null, ...extra,
})

describe('situacaoDoVoucher', () => {
  it('vencido é derivado da data', () => {
    expect(situacaoDoVoucher({ status: 'ATIVO', expires_at: '2026-09-29T11:59:59Z' }, agora)).toBe('VENCIDO')
    expect(situacaoDoVoucher({ status: 'ATIVO', expires_at: futuro }, agora)).toBe('ATIVO')
    expect(situacaoDoVoucher({ status: 'USADO', expires_at: '2020-01-01T00:00:00Z' }, agora)).toBe('USADO')
  })
})

describe('descontoDoVoucher', () => {
  it('procedimento grátis: o preço inteiro, só do mesmo procedimento', () => {
    const v = ativo({ type: 'PROCEDIMENTO', procedure_id: 'p1' })
    expect(descontoDoVoucher(v, { procedureId: 'p1', preco: 250.5 }, agora)).toEqual({ desconto: 250.5 })
    expect(descontoDoVoucher(v, { procedureId: 'p2', preco: 250.5 }, agora).motivo).toMatch(/outro procedimento/)
  })

  it('desconto em R$ não passa do preço', () => {
    expect(descontoDoVoucher(ativo({ discount_value: 50 }), { procedureId: null, preco: 30 }, agora).desconto).toBe(30)
    expect(descontoDoVoucher(ativo({ discount_value: '50.00' }), { procedureId: null, preco: 200 }, agora).desconto).toBe(50)
  })

  it('desconto em % arredonda como o banco', () => {
    // 15% de 99,99 = 14,9985 → 15,00
    const v = ativo({ type: 'DESCONTO_PERCENTUAL', discount_value: 15 })
    expect(descontoDoVoucher(v, { procedureId: null, preco: 99.99 }, agora).desconto).toBe(15)
    // 33,33% de 250,50 = 83,49165 → 83,49
    const v2 = ativo({ type: 'DESCONTO_PERCENTUAL', discount_value: 33.33 })
    expect(descontoDoVoucher(v2, { procedureId: null, preco: 250.5 }, agora).desconto).toBe(83.49)
  })

  it('produto, vencido e usado não descontam', () => {
    expect(descontoDoVoucher(ativo({ type: 'PRODUTO' }), { procedureId: null, preco: 100 }, agora).motivo).toMatch(/entregue/)
    expect(descontoDoVoucher(ativo({ expires_at: '2026-01-01T00:00:00Z', discount_value: 10 }), { procedureId: null, preco: 100 }, agora).motivo).toMatch(/vencido/)
    expect(descontoDoVoucher(ativo({ status: 'USADO', discount_value: 10 }), { procedureId: null, preco: 100 }, agora).motivo).toMatch(/usado/)
  })

  it('descrição em uma linha', () => {
    expect(descricaoDoVoucher({ type: 'DESCONTO_PERCENTUAL', name: 'x', discount_value: 15 })).toBe('15% de desconto')
    expect(descricaoDoVoucher({ type: 'PROCEDIMENTO', name: 'Limpeza de pele', discount_value: null })).toBe('Limpeza de pele')
  })
})

describe('EntradaDaRecompensa', () => {
  const base = { name: 'Limpeza grátis', points_cost: '100', validity_days: '30', is_active: true }

  it('cada tipo exige o seu campo e descarta os outros', () => {
    expect(EntradaDaRecompensa.safeParse({ ...base, type: 'PROCEDIMENTO' }).success).toBe(false)
    const r = EntradaDaRecompensa.parse({
      ...base, type: 'PROCEDIMENTO', procedure_id: '11111111-1111-4111-8111-111111111111', discount_value: 99,
    })
    expect(r.discount_value).toBeNull()
    expect(EntradaDaRecompensa.safeParse({ ...base, type: 'DESCONTO_PERCENTUAL', discount_value: 120 }).success).toBe(false)
  })

  it('custo e validade nos limites', () => {
    expect(EntradaDaRecompensa.safeParse({ ...base, type: 'DESCONTO_VALOR', discount_value: 10, points_cost: '0' }).success).toBe(false)
    expect(EntradaDaRecompensa.safeParse({ ...base, type: 'DESCONTO_VALOR', discount_value: 10, validity_days: '400' }).success).toBe(false)
  })
})

describe('saldoDepoisDaSaida', () => {
  it('sem unidade de consumo: embalagens', () => {
    expect(saldoDepoisDaSaida({ embalagens: 5, rendimento: null, unidadesPorEmbalagem: null }, 1))
      .toEqual({ embalagens: 4, rendimento: null, saldoApos: 4 })
  })

  it('com unidade de consumo: arredonda para longe do zero', () => {
    // 3 embalagens de 100 ml, rendimento 250 ml; saem 60 ml → 190 ml → 2 embalagens (uma aberta).
    expect(saldoDepoisDaSaida({ embalagens: 3, rendimento: 250, unidadesPorEmbalagem: 100 }, 60))
      .toEqual({ embalagens: 2, rendimento: 190, saldoApos: 190 })
    // Falta: −30 ml → −1 embalagem devida.
    expect(saldoDepoisDaSaida({ embalagens: 0, rendimento: 20, unidadesPorEmbalagem: 100 }, 50).embalagens).toBe(-1)
  })
})
