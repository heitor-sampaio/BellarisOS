import { describe, it, expect } from 'vitest'
import { LEVEL_COPY, notaDeAbrangencia } from '@/lib/permissions-copy'

// A10 da 10ª simulação (2026-11-10): no modelo Gerente, as Integrações vêm
// junto com "Configurações da clínica" e a tela não dizia; e a nota dizia "Só
// funciona para quem tem abrangência de rede" — falso desde a H7 (o Heitor,
// 2026-11-01: "gerente de uma unidade só mexe no que é da unidade"): quem tem
// unidade fixa mexe na aba Unidade dela.
describe('Configurações na tela de Cargos dizem o que vem junto e o que a unidade fixa alcança (A10 da 10ª)', () => {
  it('o Gerenciar diz as integrações', () => {
    expect(LEVEL_COPY.settings.MANAGE).toMatch(/integrações/i)
    expect(LEVEL_COPY.settings.MANAGE).toMatch(/WhatsApp/)
  })
  it('a nota diz que a unidade fixa mexe só na aba Unidade', () => {
    const nota = notaDeAbrangencia('settings')
    expect(nota).toMatch(/unidade fixa/)
    expect(nota).toMatch(/aba Unidade/)
    expect(nota).not.toMatch(/Só funciona para quem tem abrangência de rede/)
  })
  it('os outros módulos de rede seguem com a nota de sempre', () => {
    expect(notaDeAbrangencia('roles')).toBe('Só funciona para quem tem abrangência de rede.')
  })
})
