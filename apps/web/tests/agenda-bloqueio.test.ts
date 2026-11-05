import { describe, it, expect } from 'vitest'
import { bloqueioBate, trechoDoBloqueio, avisoDoBloqueioDaProfissional, avisoDoBloqueioDaSala, recusaDoBloqueio } from '@/lib/agenda/bloqueio'

// Decisão 3 do Heitor (7ª simulação): o bloqueio pontual da agenda. As contas
// puras — o que bate com um horário, o texto do aviso e o que se recusa.

const b = (inicio: string, fim: string, motivo = 'Almoço') => ({
  inicio: new Date(`${inicio}-03:00`).toISOString(), fim: new Date(`${fim}-03:00`).toISOString(), motivo,
})

describe('bloqueioBate', () => {
  it('bate com o que se sobrepõe, e não com o que encosta', () => {
    const almoco = b('2026-11-10T12:00:00', '2026-11-10T13:00:00')
    const t = (s: string) => new Date(`${s}-03:00`).getTime()
    expect(bloqueioBate(almoco, t('2026-11-10T12:30:00'), t('2026-11-10T13:00:00'))).toBe(true)
    expect(bloqueioBate(almoco, t('2026-11-10T11:30:00'), t('2026-11-10T12:00:00'))).toBe(false)
    expect(bloqueioBate(almoco, t('2026-11-10T13:00:00'), t('2026-11-10T13:30:00'))).toBe(false)
  })
})

describe('o texto do bloqueio', () => {
  it('no mesmo dia: "das 12:00 às 13:00"', () => {
    expect(trechoDoBloqueio(b('2026-11-10T12:00:00', '2026-11-10T13:00:00'))).toBe('das 12:00 às 13:00')
  })
  it('em vários dias: "de 10/11 às 08:00 a 20/11 às 20:00"', () => {
    expect(trechoDoBloqueio(b('2026-11-10T08:00:00', '2026-11-20T20:00:00'))).toBe('de 10/11 às 08:00 a 20/11 às 20:00')
  })
  it('o aviso da profissional e o da sala dizem o motivo e que o encaixe é permitido', () => {
    expect(avisoDoBloqueioDaProfissional('Bruna', b('2026-11-10T12:00:00', '2026-11-10T13:00:00')))
      .toBe('Horário bloqueado para Bruna das 12:00 às 13:00 (Almoço). O encaixe é permitido.')
    expect(avisoDoBloqueioDaSala('Sala Corporal', b('2026-11-10T15:00:00', '2026-11-10T16:00:00', 'Manutenção')))
      .toBe('Sala Corporal está bloqueada das 15:00 às 16:00 (Manutenção). O encaixe é permitido.')
  })
})

describe('recusaDoBloqueio', () => {
  const agora = new Date('2026-11-05T10:00:00-03:00')
  it('o fim antes do início, o motivo vazio e mais de um ano são recusados', () => {
    expect(recusaDoBloqueio({ inicio: '2026-11-10T13:00:00-03:00', fim: '2026-11-10T12:00:00-03:00', motivo: 'x' }, agora)).toBe('O fim do bloqueio tem de ser depois do início.')
    expect(recusaDoBloqueio({ inicio: '2026-11-10T12:00:00-03:00', fim: '2026-11-10T13:00:00-03:00', motivo: '  ' }, agora)).toBe('Diga o motivo do bloqueio (almoço, folga, férias…).')
    expect(recusaDoBloqueio({ inicio: '2026-11-10T12:00:00-03:00', fim: '2027-12-10T13:00:00-03:00', motivo: 'x' }, agora)).toBe('O bloqueio vai até um ano.')
  })
  it('o que já terminou não se bloqueia; o que já começou, sim (o almoço de agora)', () => {
    expect(recusaDoBloqueio({ inicio: '2026-11-05T08:00:00-03:00', fim: '2026-11-05T09:00:00-03:00', motivo: 'x' }, agora)).toBe('Esse período já passou.')
    expect(recusaDoBloqueio({ inicio: '2026-11-05T09:30:00-03:00', fim: '2026-11-05T11:00:00-03:00', motivo: 'Almoço' }, agora)).toBeNull()
  })
})
