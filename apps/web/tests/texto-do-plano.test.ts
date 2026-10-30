import { describe, it, expect } from 'vitest'
import { nomeDoPlanoNaTela, oQueSemPlanoLibera } from '@/lib/redes/texto-do-plano'

/**
 * J-7 (2026-10-30): a rede em teste aparecia como "PLANO —" na aba Geral, e
 * a Assinatura dizia "Todas as funcionalidades, sem limite" — mas o Copilot
 * não libera sem plano (lib/copilot/disponivel.ts, docs/regras/copilot.md:
 * "sem plano não libera, ao contrário das outras funcionalidades").
 */
describe('nomeDoPlanoNaTela', () => {
  it('com plano, o nome dele', () => {
    expect(nomeDoPlanoNaTela('Essencial', 'trial')).toBe('Essencial')
    expect(nomeDoPlanoNaTela('Essencial', 'active')).toBe('Essencial')
  })
  it('em teste e sem plano: "Teste grátis", não um traço', () => {
    expect(nomeDoPlanoNaTela(null, 'trial')).toBe('Teste grátis')
  })
  it('sem plano e fora do teste: "Sem plano definido"', () => {
    expect(nomeDoPlanoNaTela(null, 'active')).toBe('Sem plano definido')
  })
})

describe('oQueSemPlanoLibera — segue a regra do Copilot', () => {
  it('em teste: tudo, menos o Copilot', () => {
    expect(oQueSemPlanoLibera('trial')).toMatch(/^Teste grátis: tudo, menos o Copilot/)
  })
  it('sem plano, fora do teste: também sem o Copilot', () => {
    const t = oQueSemPlanoLibera('active')
    expect(t).toMatch(/menos o Copilot/)
    expect(t).not.toMatch(/^Todas as funcionalidades, sem limite\.$/)
  })
})
