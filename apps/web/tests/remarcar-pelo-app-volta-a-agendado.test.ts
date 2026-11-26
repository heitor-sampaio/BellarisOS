import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A remarcação pela cliente no app volta a Agendado, como a da equipe e a do
 * Copilot (o Heitor, 25/11, ao rever a H3 — "a remarcação da cliente pelo app
 * nasce Confirmada": "Discordo — Ela já desmarcou uma vez, pode acabar
 * desmarcando de novo, melhor reconfirmar."). A confirmação se pede de novo.
 * A prova no banco é `e2e/portal-cliente-remarcar-pelo-nucleo.spec.ts`.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o remarcar do app grava Agendado, sem a confirmação de antes', () => {
  const a = fonte('actions/portal-agendamentos.ts')
  const ini = a.indexOf('export async function remarcarPelaCliente')
  const corpo = a.slice(ini, a.indexOf('\nexport ', ini + 10))
  it('o update do horário novo é SCHEDULED, com confirmed_at e arrived_at nulos', () => {
    expect(corpo).toMatch(/status: 'SCHEDULED', confirmed_at: null, arrived_at: null/)
  })
  it('não grava mais CONFIRMED', () => {
    expect(corpo).not.toContain("status: 'CONFIRMED'")
  })
})
