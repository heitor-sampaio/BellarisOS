import { describe, it, expect } from 'vitest'
import { falaDaClinica, vocabulario, rotuloDoCargo } from '@/lib/unidades/vocabulario'

/**
 * F8 da 5ª simulação: a clínica de UMA unidade não fala "rede". O texto da
 * tela troca "rede" por "clínica" — as duas palavras são femininas, e os
 * artigos ("da", "na", "toda a") continuam certos.
 */
describe('falaDaClinica', () => {
  it('troca rede por clínica, com o artigo e a caixa do original', () => {
    expect(falaDaClinica('Preferências globais da rede')).toBe('Preferências globais da clínica')
    expect(falaDaClinica('Financeiro da Rede')).toBe('Financeiro da Clínica')
    expect(falaDaClinica('REDE CRIADA EM')).toBe('CLÍNICA CRIADA EM')
    expect(falaDaClinica('Nenhum evento ocorreu ainda nesta rede.')).toBe('Nenhum evento ocorreu ainda nesta clínica.')
  })

  it('"rede inteira" e "toda a rede" viram "clínica toda" e "toda a clínica"', () => {
    expect(falaDaClinica('Rede inteira')).toBe('Clínica toda')
    expect(falaDaClinica('Vale para a rede inteira.')).toBe('Vale para a clínica toda.')
    expect(falaDaClinica('2 membros em toda a rede')).toBe('2 membros em toda a clínica')
    expect(falaDaClinica('se é a rede toda ou só a unidade')).toBe('se é a clínica toda ou só a unidade')
  })

  it('o cargo "Admin da rede" é "Admin"', () => {
    expect(falaDaClinica('O cargo Admin da rede tem acesso total')).toBe('O cargo Admin tem acesso total')
    expect(rotuloDoCargo('Admin da rede', true)).toBe('Admin')
    expect(rotuloDoCargo('Admin da rede', false)).toBe('Admin da rede')
    expect(rotuloDoCargo('Recepcionista', true)).toBe('Recepcionista')
  })

  it('não mexe em palavra que só contém "rede"', () => {
    expect(falaDaClinica('Redefinir a senha')).toBe('Redefinir a senha')
    expect(falaDaClinica('redes sociais')).toBe('redes sociais')
  })
})

describe('vocabulario', () => {
  it('com duas unidades, o texto fica como está', () => {
    expect(vocabulario(false)('Toda a rede')).toBe('Toda a rede')
    expect(vocabulario(true)('Toda a rede')).toBe('Toda a clínica')
  })
})
