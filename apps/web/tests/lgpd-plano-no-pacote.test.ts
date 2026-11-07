import { describe, it, expect } from 'vitest'
import { planoParaOTitular, linhaDoPlano, linhaDaComunicacao } from '@/lib/lgpd/plano'

// A21 da 6ª simulação: o plano saía no pacote LGPD sem itens nem valor, e a
// comunicação, no PDF, sem a hora.
describe('o plano e as comunicações no pacote LGPD', () => {
  const plano = planoParaOTitular({
    created_at: '2026-11-03T13:00:00Z', status: 'ACCEPTED', branch_id: 'b1',
    treatment_plan_sessions: [
      { sort_order: 1, treatment_plan_session_procedures: [{ price: 300, procedures: { name: 'Limpeza' } }] },
      { sort_order: 0, treatment_plan_session_procedures: [{ price: '800', procedures: { name: 'Botox' } }, { price: 1200, procedures: { name: 'Preenchimento' } }] },
    ],
  }, 'Aceito', 'Moinhos')
  it('as sessões na ordem, com os procedimentos e os valores, e o total', () => {
    expect(plano.total).toBe(2300)
    expect(plano.sessoes).toEqual([
      { numero: 1, procedimentos: [{ procedimento: 'Botox', valor: 800 }, { procedimento: 'Preenchimento', valor: 1200 }] },
      { numero: 2, procedimentos: [{ procedimento: 'Limpeza', valor: 300 }] },
    ])
  })
  it('a linha do PDF diz cada sessão; a comunicação diz o dia e a hora (Brasília)', () => {
    const linha = linhaDoPlano(plano, () => '03/11/2026').replace(/ /g, ' ')
    expect(linha).toBe('03/11/2026 — Aceito — Moinhos — R$ 2.300,00 — sessão 1: Botox R$ 800,00 + Preenchimento R$ 1.200,00 — sessão 2: Limpeza R$ 300,00')
    expect(linhaDaComunicacao({ created_at: '2026-11-03T13:45:00Z', title: 'Lembrete' })).toBe('03/11/2026, 10:45 — Lembrete')
  })
})

// Sobra da F41 (9ª simulação): o plano CANCELADO saía só com "Cancelado" — sem
// o dia nem o que ele passou a valer (o usado), como o pacote cancelado diz.
describe('o plano cancelado no pacote LGPD', () => {
  const plano = planoParaOTitular({
    created_at: '2026-11-03T13:00:00Z', status: 'CANCELLED', branch_id: 'b1',
    cancelado_em: '2026-11-07T15:00:00Z', valor_cancelado: 1500,
    treatment_plan_sessions: [
      { sort_order: 0, treatment_plan_session_procedures: [{ price: 800, procedures: { name: 'Botox' } }] },
      { sort_order: 1, treatment_plan_session_procedures: [{ price: 1500, procedures: { name: 'Preenchimento' } }] },
    ],
  }, 'Cancelado', 'Moinhos')
  it('diz quando, o que valeu (as sessões feitas) e o que caiu', () => {
    expect(plano.cancelamento).toEqual({ em: '2026-11-07T15:00:00Z', valorUsado: 800, valorQueCaiu: 1500 })
  })
  it('a linha do PDF diz o cancelamento', () => {
    const linha = linhaDoPlano(plano, v => (v.startsWith('2026-11-07') ? '07/11/2026' : '03/11/2026')).replace(/ /g, ' ')
    expect(linha).toContain('cancelado em 07/11/2026: valeu R$ 800,00 (as sessões feitas); as que sobraram (R$ 1.500,00) saíram do plano')
  })
  it('o plano que não foi cancelado não tem cancelamento', () => {
    expect(planoParaOTitular({ created_at: '2026-11-03T13:00:00Z', status: 'ACCEPTED', branch_id: null }, 'Aceito', null).cancelamento).toBeNull()
  })
})
