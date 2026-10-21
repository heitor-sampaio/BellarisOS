import { describe, it, expect } from 'vitest'
import { iniciaisDoNome } from '@estetica-os/utils'
import { saudacao, primeiroNome } from '@/lib/saudacao'

// Simulação de um dia de clínica (2026-10-20): "Bom dia" às 19h, "Dra. Lívia"
// virava "Dra." (e "D" no avatar), "Fernanda Aurora (dona)" virava "F(".
describe('a saudação da topbar', () => {
  it('pela hora de Brasília', () => {
    expect(saudacao(new Date('2026-10-20T11:00:00-03:00'))).toBe('Bom dia')
    expect(saudacao(new Date('2026-10-20T14:00:00-03:00'))).toBe('Boa tarde')
    expect(saudacao(new Date('2026-10-20T19:30:00-03:00'))).toBe('Boa noite')
    expect(saudacao(new Date('2026-10-20T03:00:00-03:00'))).toBe('Boa noite')
  })
  it('o primeiro nome guarda o título', () => {
    expect(primeiroNome('Dra. Lívia Ramos')).toBe('Dra. Lívia')
    expect(primeiroNome('Fernanda Aurora (dona)')).toBe('Fernanda')
    expect(primeiroNome('Caio')).toBe('Caio')
  })
})

describe('as iniciais', () => {
  it('pulam o título e o que está entre parênteses', () => {
    expect(iniciaisDoNome('Dra. Lívia Ramos')).toBe('LR')
    expect(iniciaisDoNome('Fernanda Aurora (dona)')).toBe('FA')
    expect(iniciaisDoNome('Ana Maria Prado')).toBe('AP')
  })
})
