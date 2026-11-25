import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LEGENDA_DA_AGENDA } from '@/lib/agenda/legenda'

/**
 * Princípio 7 (A6 da 29ª): a agenda mostra o "Concluído" (o cartão cinza de
 * borda cheia) e a legenda não o dizia. Uma legenda só, nas duas agendas, com
 * os nomes de `ROTULO_DO_STATUS`; o "Agendado" (tracejado) e o "Concluído"
 * (cheio) se distinguem também na legenda.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('a legenda da agenda', () => {
  it('diz Confirmado, Em atendimento, Agendado e Concluído', () => {
    expect(LEGENDA_DA_AGENDA.map(l => l.rotulo)).toEqual(['Confirmado', 'Em atendimento', 'Agendado', 'Concluído'])
  })
  it('o Agendado é tracejado e o Concluído, cheio', () => {
    expect(LEGENDA_DA_AGENDA.find(l => l.rotulo === 'Agendado')?.tracejado).toBe(true)
    expect(LEGENDA_DA_AGENDA.find(l => l.rotulo === 'Concluído')?.tracejado).toBeFalsy()
  })
  it('as duas agendas usam a mesma legenda', () => {
    for (const arq of ['components/branch/agenda-calendar.tsx', 'components/branch/professional-agenda.tsx']) {
      expect(fonte(arq), arq).toContain('LEGENDA_DA_AGENDA.map(')
    }
  })
})
