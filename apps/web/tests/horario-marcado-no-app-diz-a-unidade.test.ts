import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { descricaoDoHorarioMarcado } from '@/lib/appointments/texto-do-aviso'

/**
 * A15 da 37ª (AG-51: "Com duas ou mais unidades ativas, tudo diz a unidade: ...
 * o 'Horário marcado' ..."): o toast "Horário marcado" do agendar do app dizia
 * quem atende e quando, sem a unidade, numa rede com duas unidades ativas.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('o toast "Horário marcado" do app', () => {
  it('com a unidade (a rede de mais de uma), diz onde; sem, como antes', () => {
    expect(descricaoDoHorarioMarcado('Ana', 'sexta-feira, 5 de dezembro às 10:00', 'Açailândia'))
      .toBe('Com Ana, sexta-feira, 5 de dezembro às 10:00, na unidade Açailândia.')
    expect(descricaoDoHorarioMarcado(null, 'sexta-feira, 5 de dezembro às 10:00', 'Açailândia'))
      .toBe('sexta-feira, 5 de dezembro às 10:00, na unidade Açailândia.')
    expect(descricaoDoHorarioMarcado('Ana', 'sexta-feira, 5 de dezembro às 10:00', null))
      .toBe('Com Ana, sexta-feira, 5 de dezembro às 10:00.')
  })

  it('o agendar do app passa a unidade quando a rede tem mais de uma ativa', () => {
    const wizard = fonte('components/client-portal/new-appointment-wizard.tsx')
    expect(wizard).toMatch(/descricaoDoHorarioMarcado\(/)
    expect(wizard).toMatch(/unidades\.length > 1 \? \(unidade \?\? null\) : null/)
  })
})
