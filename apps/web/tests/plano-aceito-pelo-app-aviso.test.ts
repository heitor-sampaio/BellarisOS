import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisoDoPlanoAceitoPeloApp } from '@/lib/plano-de-tratamento/textos'

/**
 * A4 da 35ª (princípio 7; PL-22 — receber é do PDV): o sino "Plano aceito pelo
 * app" dizia "A comanda está no PDV." também a quem não tem o PDV (a
 * profissional do plano). A frase do PDV vai só a quem recebe.
 */

describe('A4: o aviso do plano aceito pelo app', () => {
  it('a quem recebe, a comanda no PDV', () => {
    expect(avisoDoPlanoAceitoPeloApp({ nome: 'Valdirene', sessoes: 2, total: 780, recebe: true }).replace(/\s/g, ' '))
      .toBe('Valdirene aceitou o plano de tratamento (2 sessões, R$ 780,00). A comanda está no PDV.')
  })
  it('a quem não recebe, sem o PDV', () => {
    expect(avisoDoPlanoAceitoPeloApp({ nome: null, sessoes: 1, total: 300, recebe: false }).replace(/\s/g, ' '))
      .toBe('A cliente aceitou o plano de tratamento (1 sessão, R$ 300,00).')
  })
  it('a action separa quem recebe (o PDV em Gerenciar)', () => {
    const a = readFileSync(join(__dirname, '..', 'actions', 'plano-da-cliente.ts'), 'utf8')
    expect(a).toMatch(/avisoDoPlanoAceitoPeloApp\(\{/)
    expect(a).not.toContain('A comanda está no PDV.`')
  })
})
