import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { janelaDaGrade } from '@/lib/appointments/janela-da-grade'
import { ocupanteDoHorario } from '@/lib/agenda/horario-livre'
import { instanteNoFuso } from '@/lib/datetime'

/**
 * D6 da 28ª: no agendar da sessão do plano, a grade mostrou 23:30 livre para a
 * Laura, e o Confirmar recusou ("Este profissional já tem agendamento nesse
 * horário"). A sessão de 60 min às 23:30 vai até 00:30 do dia seguinte, e a
 * grade só lia os agendamentos até 23:59:59 do dia: o das 00:00 de amanhã não
 * chegava a ela. A régua é a mesma do servidor (`ocupanteDoHorario`, a sessão
 * inteira — D5 da 8ª); faltava o dado. A grade lê da véspera ao fim do dia
 * SEGUINTE.
 */

const FUSO = 'America/Sao_Paulo'

describe('a janela da grade cobre a sessão que atravessa a meia-noite', () => {
  const j = janelaDaGrade('2026-11-25', FUSO)
  it('começa na véspera (o atendimento da noite anterior pode atravessar a meia-noite)', () => {
    expect(new Date(j.desde).getTime()).toBe(instanteNoFuso('2026-11-24', '00:00', FUSO).getTime())
  })
  it('vai até o fim do dia seguinte', () => {
    expect(new Date(j.ate).getTime()).toBe(instanteNoFuso('2026-11-26', '23:59:59', FUSO).getTime())
  })
  it('o das 00:00 de amanhã entra na janela — e risca o 23:30 de 60 min', () => {
    const meiaNoite = instanteNoFuso('2026-11-26', '00:00', FUSO)
    expect(meiaNoite.getTime()).toBeLessThanOrEqual(new Date(j.ate).getTime())
    const ocupado = [{ scheduledAt: meiaNoite.toISOString(), durationMin: 60, clientName: 'Silvana' }]
    expect(ocupanteDoHorario(instanteNoFuso('2026-11-25', '23:30', FUSO), 60, ocupado)).not.toBeNull()
  })
})

describe('getSchedulingDaySlots lê pela janela da grade', () => {
  it('os agendamentos e os bloqueios até o fim do dia seguinte', () => {
    const acoes = readFileSync(join(__dirname, '..', 'actions/appointments.ts'), 'utf8')
    const corpo = acoes.slice(acoes.indexOf('export async function getSchedulingDaySlots'))
    expect(corpo).toMatch(/janelaDaGrade\(date, fuso\)/)
    expect(corpo).toMatch(/\.lte\('scheduled_at', janela\.ate\)/)
    expect(corpo).toMatch(/ate: janela\.ate/)
  })
})
