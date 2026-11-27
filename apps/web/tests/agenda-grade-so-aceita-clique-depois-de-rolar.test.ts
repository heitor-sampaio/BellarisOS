import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// As três grades da agenda rolam sozinhas depois de hidratar (para a hora de
// agora, ou o primeiro atendimento) e marcam `data-rolagem="pronta"`. Um clique
// no cartão ANTES dessa rolagem caía em outro lugar — o "Novo agendamento" de um
// horário vazio no lugar do agendamento clicado (princípio 3: o que a tela
// mostra é o que vale). Até rolar, a grade não aceita clique.
const css = readFileSync(join(__dirname, '../../../packages/nucleo/src/estilos/globals.css'), 'utf8')

describe('a grade da agenda só aceita clique depois de rolar', () => {
  for (const grade of ['data-grade-da-rede', 'data-grade-do-dia', 'data-rolagem-minha-agenda']) {
    it(grade, () => {
      const regra = new RegExp(`\\[${grade}\\]:not\\(\\[data-rolagem="pronta"\\]\\)[^{]*\\{[^}]*pointer-events:\\s*none`)
      expect(css).toMatch(regra)
    })
  }
})
