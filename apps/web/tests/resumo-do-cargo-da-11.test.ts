import { describe, it, expect } from 'vitest'
import { LEVEL_COPY, avisaSemMinhasComissoes } from '@/lib/permissions-copy'

// A15 da 11ª simulação (2026-11-10): dar Recebimentos ao cargo Comercial pôs
// "Fechamento do dia" no menu dela, e a linha do módulo não dizia (princípio 3).
describe('A15 da 11ª: Recebimentos diz que abre o Fechamento do dia', () => {
  it('o Gerenciar de Recebimentos cita o Fechamento do dia', () => {
    expect(LEVEL_COPY.cashier.MANAGE).toMatch(/Fechamento do dia/)
  })
})

// A16 da 11ª: o resumo do cargo Estoquista dizia "Não vê as próprias
// comissões…" — para quem nem atende nem vende. O aviso é de quem pode ter
// comissão: atende (agenda, prontuário) ou vende (CRM, recebimentos).
describe('A16 da 11ª: "Não vê as próprias comissões" só para quem pode ter comissão', () => {
  const nada = { agenda: 'NONE', medical_records: 'NONE', crm: 'NONE', cashier: 'NONE', financial: 'NONE', stock: 'MANAGE' } as const
  it('a Estoquista (só o estoque) não lê o aviso', () => {
    expect(avisaSemMinhasComissoes(nada)).toBe(false)
  })
  it('quem atende ou vende sem o Financeiro lê', () => {
    expect(avisaSemMinhasComissoes({ ...nada, agenda: 'MANAGE' })).toBe(true)
    expect(avisaSemMinhasComissoes({ ...nada, crm: 'MANAGE' })).toBe(true)
    expect(avisaSemMinhasComissoes({ ...nada, cashier: 'MANAGE' })).toBe(true)
  })
  it('com o Financeiro, não há o que avisar', () => {
    expect(avisaSemMinhasComissoes({ ...nada, agenda: 'MANAGE', financial: 'VIEW' })).toBe(false)
  })
})
