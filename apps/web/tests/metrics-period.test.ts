import { describe, it, expect } from 'vitest'
import { resolvePeriod, isPeriodKey, delta, ratio, percent } from '@/lib/metrics/period'
import { dayKeyTZ, monthKeyTZ } from '@/lib/datetime'

// 18/09/2026, 10:00 em São Paulo — mês pela metade, dia pela metade.
const AGORA = new Date('2026-09-18T13:00:00Z')

describe('isPeriodKey', () => {
  it('aceita só as chaves conhecidas', () => {
    expect(isPeriodKey('month')).toBe(true)
    expect(isPeriodKey('trimestre')).toBe(false)
    expect(isPeriodKey(undefined)).toBe(false)
  })
})

describe('resolvePeriod', () => {
  it('período desconhecido cai no mês', () => {
    expect(resolvePeriod('xpto', undefined, undefined, AGORA).key).toBe('month')
  })

  it('mês: a janela começa no dia 1 e o realizado para agora', () => {
    const p = resolvePeriod('month', undefined, undefined, AGORA)
    expect(p.from.toISOString()).toBe('2026-09-01T03:00:00.000Z')
    expect(p.to).toBe(AGORA)
    expect(p.label).toBe('Setembro de 2026')
  })

  it('fullTo enxerga o fim natural do mês, mesmo no futuro', () => {
    const p = resolvePeriod('month', undefined, undefined, AGORA)
    expect(p.fullTo.toISOString()).toBe('2026-10-01T02:59:59.999Z')
    expect(p.fullTo.getTime()).toBeGreaterThan(p.to.getTime())
  })

  it('o período anterior tem a MESMA duração decorrida — nunca o mês inteiro', () => {
    const p = resolvePeriod('month', undefined, undefined, AGORA)
    const atual   = p.to.getTime() - p.from.getTime()
    const anterior = p.prevTo.getTime() - p.prevFrom.getTime()
    expect(p.prevFrom.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(anterior).toBe(atual)
  })

  it('o trecho anterior não estoura o fim do mês anterior', () => {
    // 31/01: o mesmo trecho em fevereiro passaria de 28/02.
    const fimDeJaneiro = new Date('2026-01-31T23:00:00Z')
    const p = resolvePeriod('month', undefined, undefined, fimDeJaneiro)
    expect(p.prevTo.getTime()).toBeLessThanOrEqual(new Date('2026-01-01T02:59:59.999Z').getTime())
  })

  it('hoje: janela do dia, granularidade por hora, comparação com ontem', () => {
    const p = resolvePeriod('today', undefined, undefined, AGORA)
    expect(p.granularity).toBe('hour')
    expect(dayKeyTZ(p.from)).toBe('2026-09-18')
    expect(dayKeyTZ(p.prevFrom)).toBe('2026-09-17')
    expect(p.prevTo.getTime() - p.prevFrom.getTime()).toBe(p.to.getTime() - p.from.getTime())
  })

  it('"últimos 7 dias" conta hoje + os 6 anteriores', () => {
    const p = resolvePeriod('7d', undefined, undefined, AGORA)
    expect(dayKeyTZ(p.from)).toBe('2026-09-12')
    expect(p.label).toBe('Últimos 7 dias')
  })

  it('semana começa na segunda', () => {
    const p = resolvePeriod('week', undefined, undefined, AGORA)  // sexta
    expect(dayKeyTZ(p.from)).toBe('2026-09-14')
  })

  it('mês passado é período fechado e compara com o mês inteiro anterior a ele', () => {
    const p = resolvePeriod('last_month', undefined, undefined, AGORA)
    expect(monthKeyTZ(p.from)).toBe('2026-08')
    expect(p.to.toISOString()).toBe('2026-09-01T02:59:59.999Z')
    expect(monthKeyTZ(p.prevFrom)).toBe('2026-07')
    expect(p.label).toBe('Agosto de 2026')
  })

  it('todo período não tem base de comparação', () => {
    const p = resolvePeriod('all', undefined, undefined, AGORA)
    expect(p.comparable).toBe(false)
    expect(p.granularity).toBe('month')
  })

  it('personalizado usa as datas informadas, fim do dia incluído', () => {
    const p = resolvePeriod('custom', '2026-09-01', '2026-09-10', AGORA)
    expect(p.from.toISOString()).toBe('2026-09-01T03:00:00.000Z')
    expect(p.to.toISOString()).toBe('2026-09-11T02:59:59.999Z')
    expect(p.label).toBe('01/09/2026 – 10/09/2026')
  })

  it('personalizado sem datas cai no mês corrente', () => {
    const p = resolvePeriod('custom', undefined, undefined, AGORA)
    expect(monthKeyTZ(p.from)).toBe('2026-09')
  })
})

describe('delta', () => {
  it('sem base de comparação não inventa variação', () => {
    expect(delta(10, 0)).toBeNull()
  })

  it('calcula a variação com sinal', () => {
    expect(delta(150, 100)).toEqual({ value: 50, up: true })
    expect(delta(50, 100)).toEqual({ value: 50, up: false })
  })

  it('estável conta como alta (sem seta para baixo em 0%)', () => {
    expect(delta(100, 100)).toEqual({ value: 0, up: true })
  })

  it('zero no período atual é dado, não ausência', () => {
    expect(delta(0, 80)).toEqual({ value: 100, up: false })
  })
})

describe('ratio e percent', () => {
  it('sem denominador devolvem null, para a UI mostrar "—"', () => {
    expect(ratio(5, 0)).toBeNull()
    expect(percent(5, 0)).toBeNull()
  })

  it('dividem normalmente', () => {
    expect(ratio(1, 4)).toBe(0.25)
    expect(percent(1, 4)).toBe(25)
  })
})
