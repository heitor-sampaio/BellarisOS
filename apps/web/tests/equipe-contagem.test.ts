import { describe, it, expect } from 'vitest'
import { contagemDeMembros } from '@/lib/equipe/contagem'

/**
 * J-8 (2026-10-30): a Equipe dizia "1 membro cadastrados" — e a da rede,
 * "1 membro encontrados". O número, o substantivo e o particípio concordam.
 */
describe('contagemDeMembros', () => {
  it('no singular, tudo no singular', () => {
    expect(contagemDeMembros(1, 'cadastrados')).toBe('1 membro cadastrado')
    expect(contagemDeMembros(1, 'encontrados')).toBe('1 membro encontrado')
  })
  it('no plural (e no zero), tudo no plural', () => {
    expect(contagemDeMembros(2, 'cadastrados')).toBe('2 membros cadastrados')
    expect(contagemDeMembros(0, 'encontrados')).toBe('0 membros encontrados')
  })
  it('"em toda a rede" não flexiona', () => {
    expect(contagemDeMembros(1, 'em toda a rede')).toBe('1 membro em toda a rede')
    expect(contagemDeMembros(3, 'em toda a rede')).toBe('3 membros em toda a rede')
  })
})
