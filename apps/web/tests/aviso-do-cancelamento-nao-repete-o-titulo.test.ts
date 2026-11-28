import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as textos from '@/lib/appointments/texto-do-aviso'

// A13 da 41ª (princípio 7): o aviso do cancelamento repetia o título no começo
// do texto. No sino da equipe, o título "Agendamento cancelado" vinha com
// "Cancelado: Fulana — …"; o texto segue o do "Novo agendamento" (quem, o
// quê, quando), e o título diz o fato.

describe('o aviso do cancelamento à equipe', () => {
  const f = (textos as Record<string, unknown>).textoDoCanceladoParaAEquipe as
    ((cliente: string, procedimento: string, quando: string, motivo: string | null) => string) | undefined

  it('não repete o título: quem, o quê e quando, com o motivo', () => {
    expect(f, 'textoDoCanceladoParaAEquipe').toBeTypeOf('function')
    expect(f!('Ana Souza', 'Avaliação', '07/11 às 10:00', null)).toBe('Ana Souza — Avaliação de 07/11 às 10:00.')
    expect(f!('Ana Souza', 'Avaliação', '07/11 às 10:00', '  Imprevisto ')).toBe('Ana Souza — Avaliação de 07/11 às 10:00. Motivo: Imprevisto.')
  })

  it('o aviso da equipe sai dessa função', () => {
    const avisos = readFileSync(join(__dirname, '..', 'lib/appointments/avisos.ts'), 'utf8')
    expect(avisos).toMatch(/body: textoDoCanceladoParaAEquipe\(c\.clientName, c\.procedureName, when, reason \?\? null\)/)
    expect(avisos).not.toMatch(/`Cancelado: \$\{c\.clientName\}/)
  })
})
