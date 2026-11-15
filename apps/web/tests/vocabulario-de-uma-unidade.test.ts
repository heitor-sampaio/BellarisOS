import { describe, it, expect } from 'vitest'
import { falaDeUmaUnidade, vocabulario, rotuloDoCargo } from '@/lib/unidades/vocabulario'

/**
 * PO2 do plano de adaptação (a revisão do Heitor, 2026-11-13: "Clinica é a
 * mesma coisa que rede e não deve existir no sistema"). A rede de UMA unidade
 * não troca mais "rede" por "clínica" (era o F8 da 5ª simulação): o rótulo
 * que é só a rede vira o NOME dela; a frase fica com "rede".
 */
describe('falaDeUmaUnidade', () => {
  it('o rótulo que é só a rede vira o nome dela', () => {
    expect(falaDeUmaUnidade('Rede', 'Estética Bella')).toBe('Estética Bella')
    expect(falaDeUmaUnidade('A rede', 'Estética Bella')).toBe('Estética Bella')
    expect(falaDeUmaUnidade('Toda a rede', 'Estética Bella')).toBe('Estética Bella')
    expect(falaDeUmaUnidade('Da rede', 'Estética Bella')).toBe('Estética Bella')
  })

  it('a frase fica com "rede" — nunca "clínica"', () => {
    expect(falaDeUmaUnidade('Preferências globais da rede', 'Estética Bella')).toBe('Preferências globais da rede')
    expect(falaDeUmaUnidade('Vale para a rede inteira.', 'Estética Bella')).toBe('Vale para a rede inteira.')
    expect(falaDeUmaUnidade('2 membros em toda a rede', 'Estética Bella')).toBe('2 membros em toda a rede')
    expect(falaDeUmaUnidade('Rede', 'Estética Bella')).not.toMatch(/cl[íi]nica/i)
  })

  it('"A rede inteira" é o nome da abrangência e fica', () => {
    expect(falaDeUmaUnidade('A rede inteira', 'Estética Bella')).toBe('A rede inteira')
  })

  it('sem o nome, o rótulo fica como está', () => {
    expect(falaDeUmaUnidade('Rede')).toBe('Rede')
    expect(falaDeUmaUnidade('Rede', '  ')).toBe('Rede')
  })

  it('o cargo "Admin da rede" é "Admin"', () => {
    expect(falaDeUmaUnidade('O cargo Admin da rede tem acesso total')).toBe('O cargo Admin tem acesso total')
    expect(rotuloDoCargo('Admin da rede', true)).toBe('Admin')
    expect(rotuloDoCargo('Admin da rede', false)).toBe('Admin da rede')
    expect(rotuloDoCargo('Recepcionista', true)).toBe('Recepcionista')
  })
})

describe('vocabulario', () => {
  it('com duas unidades, o texto fica como está', () => {
    expect(vocabulario(false, 'Estética Bella')('Toda a rede')).toBe('Toda a rede')
    expect(vocabulario(true, 'Estética Bella')('Toda a rede')).toBe('Estética Bella')
  })
})
