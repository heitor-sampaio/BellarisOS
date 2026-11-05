import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { lotesVencendo, type LoteDoProduto } from '@/lib/estoque/lotes'
import { validadeNaTela, loteVencido } from '@/lib/estoque/validade'

// D1 da 7ª simulação (2026-11-05): a validade do lote é um DIA (o campo de
// data da entrada), gravado à meia-noite UTC. A tela do Estoque a lia com
// `new Date(...)` no fuso de Brasília e mostrava a véspera ("vence
// 14/11/2026" para o L-A de 15/11), o vencido ficava vermelho às 21h da véspera
// e o "vence em 30 dias" contava um dia a mais à noite. O teste roda em
// Brasília, onde o defeito aparece (o Vitest roda em UTC).
describe('a validade do lote no estoque, pelo dia', () => {
  const tzAntes = process.env.TZ
  beforeAll(() => { process.env.TZ = 'America/Sao_Paulo' })
  afterAll(() => { process.env.TZ = tzAntes })

  const lote = (validade: string | null): LoteDoProduto => ({
    id: validade ?? 'x', produtoId: 'p', unidadeId: 'u', numero: 'L-A', validade, quantidade: 1, custoPorEmbalagem: null,
  })

  it('mostra o dia gravado, não a véspera', () => {
    expect(validadeNaTela('2026-11-15 00:00:00+00')).toBe('15/11/2026')
    expect(validadeNaTela('2026-11-15T00:00:00+00:00')).toBe('15/11/2026')
    expect(validadeNaTela(null)).toBeNull()
  })

  it('no dia da validade o lote ainda vale; vence no dia seguinte', () => {
    expect(loteVencido('2026-11-15 00:00:00+00', new Date('2026-11-14T22:00:00-03:00')), 'às 22h da véspera').toBe(false)
    expect(loteVencido('2026-11-15 00:00:00+00', new Date('2026-11-15T23:00:00-03:00')), 'no dia').toBe(false)
    expect(loteVencido('2026-11-15 00:00:00+00', new Date('2026-11-16T00:10:00-03:00')), 'no dia seguinte').toBe(true)
    expect(loteVencido(null, new Date())).toBe(false)
  })

  it('"vence até" conta pelo dia de Brasília, também à noite', () => {
    // 05/11 às 22h + 30 dias = 05/12: o lote de 06/12 não vence "em 30 dias".
    const ate = new Date('2026-12-05T22:00:00-03:00')
    const lotes = [lote('2026-12-05 00:00:00+00'), lote('2026-12-06 00:00:00+00'), lote('2026-10-01 00:00:00+00'), lote(null)]
    expect(lotesVencendo(lotes, ate).map(l => l.validade)).toEqual(['2026-12-05 00:00:00+00', '2026-10-01 00:00:00+00'])
  })
})
