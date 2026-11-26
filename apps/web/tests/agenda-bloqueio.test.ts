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
  // R07 (o Heitor, 26/11, no chat, sobre a R07: "r07 se ta bloqueado não dá pra
  // marcar"): era "…O encaixe é permitido."; o bloqueado não se marca.
  it('o aviso da profissional e o da sala dizem o motivo (o bloqueado não se marca)', () => {
    expect(avisoDoBloqueioDaProfissional('Bruna', b('2026-11-10T12:00:00', '2026-11-10T13:00:00')))
      .toBe('Bruna está com o horário bloqueado das 12:00 às 13:00 (Almoço).')
    expect(avisoDoBloqueioDaSala('Sala Corporal', b('2026-11-10T15:00:00', '2026-11-10T16:00:00', 'Manutenção')))
      .toBe('Sala Corporal está bloqueada das 15:00 às 16:00 (Manutenção).')
  })
})

describe('recusaDoBloqueio', () => {
  const agora = new Date('2026-11-05T10:00:00-03:00')
  it('o fim antes do início e o motivo vazio são recusados; mais de um ano, não', () => {
    expect(recusaDoBloqueio({ inicio: '2026-11-10T13:00:00-03:00', fim: '2026-11-10T12:00:00-03:00', motivo: 'x' }, agora)).toBe('O fim do bloqueio tem de ser depois do início.')
    expect(recusaDoBloqueio({ inicio: '2026-11-10T12:00:00-03:00', fim: '2026-11-10T13:00:00-03:00', motivo: '  ' }, agora)).toBe('Diga o motivo do bloqueio (almoço, folga, férias…).')
    // O Heitor, 25/11, perguntado se o bloqueio acima de um ano recusa ou avisa: escolheu "Acima de 1 ano avisa".
    expect(recusaDoBloqueio({ inicio: '2026-11-10T12:00:00-03:00', fim: '2027-12-10T13:00:00-03:00', motivo: 'x' }, agora)).toBeNull()
  })
  it('o que já terminou não se bloqueia; o que já começou, sim (o almoço de agora)', () => {
    expect(recusaDoBloqueio({ inicio: '2026-11-05T08:00:00-03:00', fim: '2026-11-05T09:00:00-03:00', motivo: 'x' }, agora)).toBe('Esse período já passou.')
    expect(recusaDoBloqueio({ inicio: '2026-11-05T09:30:00-03:00', fim: '2026-11-05T11:00:00-03:00', motivo: 'Almoço' }, agora)).toBeNull()
  })
})
