import { describe, it, expect } from 'vitest'
import {
  noFuso, dayKeyTZ, startOfDayTZ, instanteNoFuso, horaNoFuso, BUSINESS_TZ,
} from '@/lib/datetime'
import { FUSOS, FUSO_PADRAO, fusoPeloEstado, fusoValido, nomeDoFuso, rotuloDoFuso } from '@/lib/unidades/fuso'
import { resolvePeriod } from '@/lib/metrics/period'

/**
 * F62 — o fuso da clínica (o Heitor, 2026-11-11: "Não, deixa a clinica
 * configurar o seu fuso"). A unidade tem o fuso dela, com o horário de
 * Brasília como padrão; o setup sugere pelo estado do CEP.
 */

describe('as opções de fuso', () => {
  it('o padrão é o horário de Brasília, e a lista tem os quatro fusos do Brasil', () => {
    expect(FUSO_PADRAO).toBe('America/Sao_Paulo')
    expect(FUSO_PADRAO).toBe(BUSINESS_TZ)
    expect(rotuloDoFuso(FUSO_PADRAO)).toMatch(/^Horário de Brasília/)
    const valores = FUSOS.map(f => f.valor)
    for (const tz of ['America/Sao_Paulo', 'America/Noronha', 'America/Manaus', 'America/Cuiaba',
      'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco']) {
      expect(valores).toContain(tz)
    }
  })

  it('o estado do CEP sugere o fuso', () => {
    expect(fusoPeloEstado('AM')).toBe('America/Manaus')
    expect(fusoPeloEstado('am')).toBe('America/Manaus')
    expect(fusoPeloEstado('MT')).toBe('America/Cuiaba')
    expect(fusoPeloEstado('MS')).toBe('America/Campo_Grande')
    expect(fusoPeloEstado('RO')).toBe('America/Porto_Velho')
    expect(fusoPeloEstado('RR')).toBe('America/Boa_Vista')
    expect(fusoPeloEstado('AC')).toBe('America/Rio_Branco')
    expect(fusoPeloEstado('SP')).toBe('America/Sao_Paulo')
    expect(fusoPeloEstado('PE')).toBe('America/Sao_Paulo')
    expect(fusoPeloEstado('')).toBe('America/Sao_Paulo')
    expect(fusoPeloEstado(null)).toBe('America/Sao_Paulo')
  })

  it('Fernando de Noronha fica à parte, pela cidade', () => {
    expect(fusoPeloEstado('PE', 'Fernando de Noronha')).toBe('America/Noronha')
    expect(fusoPeloEstado('PE', 'Recife')).toBe('America/Sao_Paulo')
  })

  it('o que não está na lista não vale, e cai no padrão', () => {
    expect(fusoValido('America/Manaus')).toBe('America/Manaus')
    expect(fusoValido('Europe/Lisbon')).toBe('America/Sao_Paulo')
    expect(fusoValido(null)).toBe('America/Sao_Paulo')
    expect(nomeDoFuso('America/Manaus')).toBe('horário de Manaus')
    expect(nomeDoFuso('America/Sao_Paulo')).toBe('horário de Brasília')
  })
})

describe('as datas no fuso da unidade', () => {
  // 23:30 de 10/11 em Manaus = 03:30Z de 11/11 = 00:30 de 11/11 em Brasília.
  const NOITE_EM_MANAUS = new Date('2026-11-11T03:30:00Z')

  it('o dia é o da unidade', () => {
    expect(dayKeyTZ(NOITE_EM_MANAUS)).toBe('2026-11-11')
    expect(noFuso('America/Manaus').dayKey(NOITE_EM_MANAUS)).toBe('2026-11-10')
    expect(noFuso('America/Manaus').startOfDay(NOITE_EM_MANAUS).toISOString()).toBe('2026-11-10T04:00:00.000Z')
    expect(startOfDayTZ(NOITE_EM_MANAUS).toISOString()).toBe('2026-11-11T03:00:00.000Z')
    expect(noFuso('America/Rio_Branco').startOfDay(NOITE_EM_MANAUS).toISOString()).toBe('2026-11-10T05:00:00.000Z')
    expect(noFuso('America/Noronha').startOfDay(NOITE_EM_MANAUS).toISOString()).toBe('2026-11-11T02:00:00.000Z')
  })

  it('a hora de parede vira o instante certo', () => {
    expect(instanteNoFuso('2026-11-10', '09:00').toISOString()).toBe('2026-11-10T12:00:00.000Z')
    expect(instanteNoFuso('2026-11-10', '09:00', 'America/Manaus').toISOString()).toBe('2026-11-10T13:00:00.000Z')
    expect(horaNoFuso(new Date('2026-11-10T13:00:00Z'), 'America/Manaus')).toBe('09:00')
    expect(horaNoFuso(new Date('2026-11-10T13:00:00Z'))).toBe('10:00')
  })

  it('o período dos indicadores sai no fuso pedido; sem fuso, Brasília', () => {
    const agora = new Date('2026-11-11T03:30:00Z')
    expect(resolvePeriod('today', undefined, undefined, agora).from.toISOString()).toBe('2026-11-11T03:00:00.000Z')
    const manaus = resolvePeriod('today', undefined, undefined, agora, 'America/Manaus')
    expect(manaus.from.toISOString()).toBe('2026-11-10T04:00:00.000Z')
    expect(manaus.fullTo.toISOString()).toBe('2026-11-11T03:59:59.999Z')
    expect(manaus.label).toBe('Hoje, 10 de novembro')
    expect(resolvePeriod('month', undefined, undefined, agora, 'America/Manaus').from.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(resolvePeriod('custom', '2026-11-01', '2026-11-10', agora, 'America/Manaus').to.toISOString()).toBe('2026-11-11T03:59:59.999Z')
  })
})
