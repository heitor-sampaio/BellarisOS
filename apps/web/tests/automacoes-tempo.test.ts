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

describe('estaNaHora — de tempos em tempos', () => {
  const cada30 = { frequencia: 'minutos' as const, intervalo: 30 }

  it('nunca disparou: começa agora', () => {
    // O primeiro ciclo é o de ligar a automação — esperar 30 minutos para o
    // primeiro seria a automação parecer morta justo quando se confere.
    expect(estaNaHora(cada30, null, emBrasilia(3, 17))).toBe(true)
  })

  it('conta a partir do último disparo, não do relógio', () => {
    const ultimo = emBrasilia(9, 7).toISOString()
    expect(estaNaHora(cada30, ultimo, emBrasilia(9, 30))).toBe(false)
    expect(estaNaHora(cada30, ultimo, emBrasilia(9, 37))).toBe(true)
  })

  it('não tem hora do dia: dispara de madrugada igual', () => {
    // A trava de "já disparou hoje" e a tolerância de uma hora são das
    // frequências de relógio. Aqui elas parariam o fluxo depois do 1º disparo.
    const ultimo = emBrasilia(2, 0).toISOString()
    expect(estaNaHora(cada30, ultimo, emBrasilia(2, 31))).toBe(true)
  })

  it('meio passo do cron de folga, senão o intervalo dobra', () => {
    // Disparo às 9:00:05, passagem seguinte às 9:05:03: cobrar os 5 minutos
    // cheios reprovaria por dois segundos e o próximo iria para as 9:10 — "a
    // cada 5" virando 10, e o atraso somando a cada volta.
    const cada5 = { frequencia: 'minutos' as const, intervalo: 5 }
    const ultimo = new Date(emBrasilia(9, 0).getTime() + 5_000).toISOString()
    const agora  = new Date(emBrasilia(9, 5).getTime() + 3_000)
    expect(estaNaHora(cada5, ultimo, agora)).toBe(true)
  })

  it('horas multiplicam por 60', () => {
    const cada2h = { frequencia: 'horas' as const, intervalo: 2 }
    const ultimo = emBrasilia(8, 0).toISOString()
    expect(estaNaHora(cada2h, ultimo, emBrasilia(9, 30))).toBe(false)
    expect(estaNaHora(cada2h, ultimo, emBrasilia(10, 0))).toBe(true)
  })

  it('intervalo abaixo do piso vale como o piso, não como "sempre"', () => {
    // O validador recusa antes de ativar, mas grafo salvo com 1 minuto não
    // pode virar disparo em toda passagem do cron.
    const cada1 = { frequencia: 'minutos' as const, intervalo: 1 }
    const ultimo = emBrasilia(9, 0).toISOString()
    expect(estaNaHora(cada1, ultimo, emBrasilia(9, 2))).toBe(false)
    expect(estaNaHora(cada1, ultimo, emBrasilia(9, 5))).toBe(true)
  })

  it('sem intervalo não dispara nunca', () => {
    expect(estaNaHora({ frequencia: 'minutos' }, null, emBrasilia(9))).toBe(false)
    expect(estaNaHora({ frequencia: 'horas', intervalo: 0 }, null, emBrasilia(9))).toBe(false)
  })
})
