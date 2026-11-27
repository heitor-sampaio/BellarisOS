import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O motivo do desconto fica só com o rótulo "Motivo do desconto (opcional)" (o
 * Heitor, 27/11, R37: "Pode tirar a frase (a proposta)"). A frase "Sem motivo, a
 * lista do Financeiro mostra só o valor do desconto…" explicava a tela (o
 * Heitor, 26/11: "intuitivo não é explicativo").
 */
const ler = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8')

describe('o motivo do desconto sem a frase que explica', () => {
  it('nem o campo do desconto nem o receber mostram a frase', () => {
    for (const f of ['components/shared/campo-do-desconto.tsx', 'components/shared/receber-atendimento.tsx']) {
      expect(ler(f), f).not.toMatch(/LembreteDoMotivo|data-lembrete-do-motivo|Sem motivo, a lista do Financeiro/)
    }
  })
  it('o rótulo curto continua', () => {
    expect(ler('components/shared/campo-do-desconto.tsx')).toContain('Motivo do desconto (opcional)')
  })
})
