import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SITUACAO_NA_FRASE } from '@/lib/copilot/ferramentas/comum'

/**
 * A recusa do Copilot diz "Este agendamento está <situação>." Com o rótulo da lista ("check-in", "faltou") a frase
 * saía "está check-in" e "está faltou". O rótulo é "Check-in" em todo lugar (o Heitor, 27/11: "Fica Check-in em
 * todos os lugares"); a frase usa a forma que cabe depois de "está" (decisão do Claude, 27/11).
 */
describe('a situação do agendamento na frase do Copilot', () => {
  it('cabe depois de "está"', () => {
    expect(SITUACAO_NA_FRASE.ARRIVED).toBe('com o check-in feito')
    expect(SITUACAO_NA_FRASE.NO_SHOW).toBe('marcado como falta')
    expect(SITUACAO_NA_FRASE.COMPLETED).toBe('concluído')
    expect(SITUACAO_NA_FRASE.IN_PROGRESS).toBe('em atendimento')
  })

  it('as recusas usam a forma da frase, não o rótulo da lista', () => {
    const src = readFileSync(join(__dirname, '..', 'lib/copilot/ferramentas/agenda-escrita.ts'), 'utf8')
    expect(src).not.toMatch(/Este agendamento está \$\{STATUS_DO_AGENDAMENTO\[/)
    expect(src).toMatch(/Este agendamento está \$\{SITUACAO_NA_FRASE\[ag\.status\]/)
  })
})
