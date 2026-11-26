import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDaValidadeNaEquipe } from '@/lib/plano-de-tratamento/validade'

const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/**
 * PL-23 (catálogo do Atendimento; o Heitor, 13/11: "faz sentido, pode fechar o
 * plano de tratamento"): "O plano proposto mostra a validade da proposta (da
 * rede), só como informação". D16 da 31ª: só o app da cliente a mostrava; a
 * tela do plano da equipe (C12, proposto) não.
 */
describe('o plano proposto mostra a validade da proposta na tela da equipe (PL-23)', () => {
  const criado = '2026-11-25T13:00:00Z'
  it('dentro da validade', () => {
    expect(textoDaValidadeNaEquipe(criado, 30, 'America/Sao_Paulo', Date.parse('2026-11-26T13:00:00Z')))
      .toBe('Proposta válida até 25/12/2026 (a validade da rede é só informação).')
  })
  it('vencida: avisa, e o plano ainda se aceita', () => {
    expect(textoDaValidadeNaEquipe(criado, 30, 'America/Sao_Paulo', Date.parse('2026-12-26T13:00:00Z')))
      .toBe('Proposta vencida em 25/12/2026: os valores podem ter mudado. A validade é só informação — o plano ainda se aceita.')
  })
  it('a tela do plano recebe a validade do servidor e a mostra só no proposto', () => {
    expect(ler('actions/treatment-plans.ts')).toContain("select('plano_validade_dias')")
    expect(ler('components/branch/plano-aberto.tsx')).toContain('data-validade-da-proposta')
  })
})
