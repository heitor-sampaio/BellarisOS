import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { valorDoPrePagoNaFicha, SESSAO_AGENDADA_SE_CANCELA_NA_AGENDA } from '@/lib/pre-pago/contagem'

const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const sp = (s: string) => s.replace(/ /g, ' ')

/**
 * PP-03 (vendas-financeiro.md: "a venda passa a valer o vendido menos as
 * unidades canceladas"; princípio 3). D8 da 31ª: a C04 comprou 2 Limpezas
 * (R$ 340), cancelou a sessão livre e recebeu R$ 170 de estorno — Vendas e o
 * caixa diziam R$ 170, e a ficha seguia "2× Limpeza … R$ 340,00".
 *
 * A11 da 31ª (princípio 7): a sessão agendada não tinha botão nem dizia por
 * que não se cancela ali — "Falta ou cancelamento do agendamento DEVOLVE a
 * unidade" (vendas-financeiro.md), e só a livre se cancela (PP-03).
 */
describe('a ficha do pré-pago depois do cancelamento de uma sessão (PP-03)', () => {
  const unidades = [
    { preco: 170, status: 'CANCELADA' as const },
    { preco: 170, status: 'DISPONIVEL' as const },
  ]
  it('vale o vendido menos as sessões canceladas, e diz a cancelada', () => {
    expect(sp(valorDoPrePagoNaFicha({ price: 340, desconto: 0, unidades })))
      .toBe('R$ 170,00 (vendido por R$ 340,00; 1 sessão cancelada, R$ 170,00)')
  })
  it('sem cancelada: o vendido, com o desconto, como antes', () => {
    expect(sp(valorDoPrePagoNaFicha({ price: 340, desconto: 20, unidades: unidades.map(u => ({ ...u, status: 'DISPONIVEL' as const })) })))
      .toBe('R$ 340,00 (desconto de R$ 20,00)')
  })
  it('o card usa o valor que vale agora', () => {
    expect(ler('components/shared/procedimentos-pagos.tsx')).toContain('valorDoPrePagoNaFicha(')
  })
})

describe('a sessão agendada do pré-pago diz onde se cancela (A11)', () => {
  it('o texto diz o caminho', () => {
    expect(SESSAO_AGENDADA_SE_CANCELA_NA_AGENDA)
      .toBe('A sessão agendada não se cancela aqui: cancele antes o agendamento, na agenda. A sessão volta a ficar livre e o “Cancelar” aparece aqui.')
  })
  it('o card mostra a explicação a quem pode cancelar, na sessão agendada', () => {
    const fonte = ler('components/shared/procedimentos-pagos.tsx')
    expect(fonte).toContain('SESSAO_AGENDADA_SE_CANCELA_NA_AGENDA')
    expect(fonte).toContain('data-agendada-se-cancela-na-agenda')
  })
})
