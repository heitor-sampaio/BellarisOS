import { describe, it, expect } from 'vitest'
import { quandoVoltar, quandoChegarEm, estaNaHora } from '@/lib/automacoes/tempo'

/**
 * As esperas e o relógio.
 *
 * Dois casos carregam o peso todo:
 *
 *  - **momento que já passou** — "24h antes" de um agendamento que é daqui a
 *    duas horas. Esperar seria travar num instante que não existe mais, e o
 *    sintoma é o pior possível: nada acontece e nada explica;
 *  - **disparo repetido** — o cron passa de cinco em cinco minutos, e sem a
 *    memória do último disparo o lembrete das 9h sairia doze vezes por hora.
 */

/** Um instante a partir da hora de BRASÍLIA (UTC-3). */
function emBrasilia(hora: number, minuto = 0, dia = 24): Date {
  return new Date(Date.UTC(2026, 8, dia, hora + 3, minuto))
}

describe('quandoVoltar', () => {
  const base = new Date('2026-09-24T12:00:00.000Z')

  it('soma na unidade certa', () => {
    expect(quandoVoltar({ quantidade: 30, unidade: 'minutos' }, base).toISOString())
      .toBe('2026-09-24T12:30:00.000Z')
    expect(quandoVoltar({ quantidade: 2, unidade: 'horas' }, base).toISOString())
      .toBe('2026-09-24T14:00:00.000Z')
    expect(quandoVoltar({ quantidade: 3, unidade: 'dias' }, base).toISOString())
      .toBe('2026-09-27T12:00:00.000Z')
  })

  it('espera de zero ou negativa é recusada', () => {
    // Uma espera de zero faria o run voltar à fila imediatamente e o cron
    // rodá-lo de novo — o mesmo passo para sempre, a cada cinco minutos.
    expect(() => quandoVoltar({ quantidade: 0, unidade: 'dias' }, base)).toThrow()
    expect(() => quandoVoltar({ quantidade: -1, unidade: 'horas' }, base)).toThrow()
  })
})

describe('quandoChegarEm', () => {
  const agora = new Date('2026-09-24T12:00:00.000Z')
  const contexto = {
    agendamento: { data: '2026-09-26T14:00:00.000Z' },
    cliente:     { nascimento: null, nome: 'Ana' },
  }

  it('calcula o deslocamento antes da data', () => {
    const r = quandoChegarEm({ campo: 'agendamento.data', minutos: -1440 }, contexto, agora)
    expect(r.data!.toISOString()).toBe('2026-09-25T14:00:00.000Z')
  })

  it('calcula o deslocamento depois da data', () => {
    const r = quandoChegarEm({ campo: 'agendamento.data', minutos: 4320 }, contexto, agora)
    expect(r.data!.toISOString()).toBe('2026-09-29T14:00:00.000Z')
  })

  it('momento que já passou faz o fluxo SEGUIR, não travar', () => {
    // "2 dias antes" de um agendamento que é daqui a 2 horas.
    const proximo = { agendamento: { data: '2026-09-24T14:00:00.000Z' } }
    const r = quandoChegarEm({ campo: 'agendamento.data', minutos: -2880 }, proximo, agora)
    expect(r.data).toBeNull()
    expect(r.motivo).toMatch(/já passou/)
  })

  it('campo vazio ou que não é data não vira espera', () => {
    expect(quandoChegarEm({ campo: 'cliente.nascimento', minutos: 0 }, contexto, agora).data).toBeNull()
    expect(quandoChegarEm({ campo: 'cliente.nome', minutos: 0 }, contexto, agora).motivo)
      .toMatch(/não contém uma data/)
  })
})

describe('estaNaHora', () => {
  const diario = { frequencia: 'diaria' as const, hora: '09:00' }

  it('dispara na hora e na tolerância; não antes', () => {
    expect(estaNaHora(diario, null, emBrasilia(9, 0))).toBe(true)
    expect(estaNaHora(diario, null, emBrasilia(9, 40))).toBe(true)
    expect(estaNaHora(diario, null, emBrasilia(8, 59))).toBe(false)
  })

  it('passada a tolerância, o dia passou', () => {
    // Mandar o lembrete do café da manhã às onze da noite é pior que não
    // mandar.
    expect(estaNaHora(diario, null, emBrasilia(10, 30))).toBe(false)
    expect(estaNaHora(diario, null, emBrasilia(23))).toBe(false)
  })

  it('não repete no mesmo dia', () => {
    // O cron passa de cinco em cinco minutos: sem esta trava, das 9:00 às 9:05
    // o lembrete diário sairia uma vez por passagem.
    const jaDisparou = emBrasilia(9, 2).toISOString()
    expect(estaNaHora(diario, jaDisparou, emBrasilia(9, 7))).toBe(false)
  })

  it('no dia seguinte volta a disparar', () => {
    const ontem = emBrasilia(9, 2, 23).toISOString()
    expect(estaNaHora(diario, ontem, emBrasilia(9, 5, 24))).toBe(true)
  })

  it('semanal só no dia escolhido', () => {
    // 24/09/2026 é uma quinta-feira (dia 4).
    const quinta = { frequencia: 'semanal' as const, hora: '09:00', diaDaSemana: 4 }
    const segunda = { frequencia: 'semanal' as const, hora: '09:00', diaDaSemana: 1 }
    expect(estaNaHora(quinta,  null, emBrasilia(9, 10))).toBe(true)
    expect(estaNaHora(segunda, null, emBrasilia(9, 10))).toBe(false)
  })

  it('mensal só no dia do mês escolhido', () => {
    expect(estaNaHora({ frequencia: 'mensal', hora: '09:00', diaDoMes: 24 }, null, emBrasilia(9, 10))).toBe(true)
    expect(estaNaHora({ frequencia: 'mensal', hora: '09:00', diaDoMes: 5 },  null, emBrasilia(9, 10))).toBe(false)
  })

  it('hora malformada não dispara nunca', () => {
    expect(estaNaHora({ frequencia: 'diaria', hora: '' },      null, emBrasilia(9))).toBe(false)
    expect(estaNaHora({ frequencia: 'diaria', hora: '25:00' }, null, emBrasilia(9))).toBe(false)
  })
})
