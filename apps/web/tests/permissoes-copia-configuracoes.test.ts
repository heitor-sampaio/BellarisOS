import { describe, it, expect } from 'vitest'
import { LEVEL_COPY, notaDeAbrangencia } from '@/lib/permissions-copy'

// A10 da 10ª simulação (2026-11-10): no modelo Gerente, as Integrações vêm
// junto com "Configurações da clínica" e a tela não dizia; e a nota dizia "Só
// funciona para quem tem abrangência de rede" — falso desde a H7 (o Heitor,
// 2026-11-01: "gerente de uma unidade só mexe no que é da unidade"): quem tem
// unidade fixa mexe na aba Unidade dela. Desde 18/11 (o Heitor: a configuração
// da rede toda é "só pela conta admin") o resto é só da Admin da rede, e a nota
// diz isso.
describe('Configurações na tela de Cargos dizem o que vem junto e o que a unidade fixa alcança (A10 da 10ª)', () => {
  it('o Gerenciar diz as integrações', () => {
    expect(LEVEL_COPY.settings.MANAGE).toMatch(/integrações/i)
    expect(LEVEL_COPY.settings.MANAGE).toMatch(/WhatsApp/)
  })
  it('a nota diz que quem não é a Admin da rede mexe só na aba Unidade', () => {
    const nota = notaDeAbrangencia('settings')
    expect(nota).toMatch(/Quem não é a Admin da rede mexe só na aba Unidade/)
    expect(nota).toMatch(/só a Admin da rede muda/)
    expect(nota).not.toMatch(/Só funciona para quem tem abrangência de rede/)
  })
  it('os outros módulos de rede dizem que mudar é só da Admin da rede', async () => {
    expect(notaDeAbrangencia('roles')).toBe('Só funciona para quem tem “A rede inteira”, e criar e mudar é só da Admin da rede.')
    const { SO_NA_REDE_NOTE } = await import('@/lib/permissions-copy')
    expect(SO_NA_REDE_NOTE.automations).toMatch(/criar e mudar é só da Admin da rede/)
    expect(SO_NA_REDE_NOTE.marketing).toMatch(/criar e mudar é só da Admin da rede/)
  })
})
