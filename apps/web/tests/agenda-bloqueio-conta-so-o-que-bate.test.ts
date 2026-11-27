import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * AG-20: bloquear um período que já tem atendimento não mexe nele, e o aviso
 * diz quantos CONTINUAM nele. A conta levava todo o que começava até 12 h
 * antes do bloqueio, mesmo o que terminava antes dele: o das 10:00 entrava no
 * bloqueio das 13–16, e o feriado dizia "1 atendimento" sem nenhum no dia.
 * Conta só o que se sobrepõe ao período, pela duração de cada agendamento.
 */
const fonte = (arq: string) => readFileSync(join(__dirname, '..', arq), 'utf8')
const em = (hora: string) => `2026-12-10T${hora}:00-03:00`
const ms = (hora: string) => new Date(em(hora)).getTime()
const ag = (hora: string, duracao: number | null) => ({ scheduled_at: em(hora), duration_min: duracao, status: 'SCHEDULED', completed_at: null })

describe('o aviso do bloqueio conta só o que bate no período', () => {
  it('o das 10:00 (60 min) não entra no bloqueio das 13:00 às 16:00', async () => {
    const { quantosBatemNoBloqueio } = await import('@/lib/agenda/bloqueio')
    expect(quantosBatemNoBloqueio([ag('10:00', 60)], ms('13:00'), ms('16:00'))).toBe(0)
  })
  it('o que começa antes e ainda ocupa o período entra; o que encosta no início, não', async () => {
    const { quantosBatemNoBloqueio } = await import('@/lib/agenda/bloqueio')
    expect(quantosBatemNoBloqueio([ag('12:30', 60)], ms('13:00'), ms('16:00'))).toBe(1)
    expect(quantosBatemNoBloqueio([ag('12:00', 60)], ms('13:00'), ms('16:00'))).toBe(0)
    expect(quantosBatemNoBloqueio([ag('14:00', 30), ag('15:30', 60)], ms('13:00'), ms('16:00'))).toBe(2)
  })
  it('o de 30 h de ontem que continua entra (qualquer duração)', async () => {
    const { quantosBatemNoBloqueio } = await import('@/lib/agenda/bloqueio')
    const ontem = { scheduled_at: '2026-12-09T08:00:00-03:00', duration_min: 30 * 60, status: 'SCHEDULED', completed_at: null }
    expect(quantosBatemNoBloqueio([ontem], ms('10:00'), ms('11:00'))).toBe(1)
  })
  it('a action conta pela regra única, sem a janela das 12 h', () => {
    const acao = fonte('actions/agenda-bloqueios.ts')
    const i = acao.indexOf('async function contarMarcados(')
    const corpo = acao.slice(i, acao.indexOf('\n}\n', i))
    expect(corpo).toMatch(/quantosBatemNoBloqueio\(/)
    expect(corpo).not.toMatch(/DURACAO_COMUM_MIN \* 60_000 \|\|/)
  })
})
