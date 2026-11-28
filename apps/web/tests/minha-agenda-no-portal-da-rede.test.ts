import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A "Minha agenda" no portal da rede (CLAUDE.md §11, SM2: a vista pessoal só
 * MOSTRA os horários dela). A6 da 40ª simulação: no /admin, a vista pessoal
 * tinha o título "Agenda" e o seletor "Toda a rede" — parecia a agenda
 * inteira (princípio 7). Como na unidade (`ProfessionalAgendaView`, "Minha
 * agenda"), o título diz de quem é, e o seletor das unidades da rede não
 * aparece. O E2E está em `e2e/vistas-pessoais-e-cada-passo.spec.ts`.
 */
const ler = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8')

describe('a vista pessoal no portal da rede é a "Minha agenda"', () => {
  const f = ler('components/admin/admin-agenda-view.tsx')
  it('o título diz "Minha agenda" na vista pessoal', () => {
    expect(f).toMatch(/\{vistaDela \? 'Minha agenda' : 'Agenda'\}/)
  })
  it('o seletor "Toda a rede" não aparece na vista pessoal', () => {
    expect(f).toMatch(/\{!vistaDela && todasUnidades\.length > 1 && \(\s*<SegSelect/)
  })
})
