import { describe, it, expect } from 'vitest'
import { explicacaoDoCatalogo } from '@/lib/fidelidade/formato'

/**
 * J-12 (2026-10-30): o catálogo de recompensas dizia "feita pela equipe na
 * ficha do cliente" mesmo com a troca pelo app ligada (`client_redeem`). O
 * texto segue a configuração da rede.
 */
describe('explicacaoDoCatalogo', () => {
  it('com a troca pelo app desligada: só a equipe troca, na ficha', () => {
    const t = explicacaoDoCatalogo(false)
    expect(t).toMatch(/feita pela equipe na ficha/)
    expect(t).not.toMatch(/app/)
  })
  it('com a troca pelo app ligada: a cliente troca pelo app, e a equipe também na ficha', () => {
    const t = explicacaoDoCatalogo(true)
    expect(t).toMatch(/pelo app/)
    expect(t).toMatch(/equipe/)
    expect(t).not.toMatch(/feita pela equipe na ficha do cliente\.$/)
  })
})
