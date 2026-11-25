import { describe, it, expect, vi } from 'vitest'
import {
  noFuso, dayKeyTZ, startOfDayTZ, instanteNoFuso, horaNoFuso, BUSINESS_TZ, naParede, daParede,
} from '@/lib/datetime'
import { aPartirDeAgora } from '@/lib/checkout/grade-de-horarios'
import { trechoDoBloqueio } from '@/lib/agenda/bloqueio'
import { textoDoConcluido } from '@/lib/agenda/hora-real'
import { ehODiaDoAgendamento } from '@/lib/agenda/chegada'
import { foraDoHorarioDaUnidade } from '@/lib/agenda/horario'
import { FUSOS, FUSO_PADRAO, fusoPeloEstado, fusoValido, nomeDoFuso, rotuloDoFuso } from '@/lib/unidades/fuso'
import { resolvePeriod } from '@/lib/metrics/period'
import fs from 'node:fs'
import path from 'node:path'

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

describe('a agenda e o agendar no fuso da unidade (F62, fatia 2)', () => {
  it('a grade "de parede": os campos locais são o relógio da unidade, e o instante volta inteiro', () => {
    const instante = new Date('2026-11-14T13:00:00.000Z')          // 09:00 em Manaus
    const parede = naParede(instante, 'America/Manaus')
    expect([parede.getHours(), parede.getMinutes(), parede.getDate()]).toEqual([9, 0, 14])
    expect(daParede(parede, 'America/Manaus').toISOString()).toBe(instante.toISOString())
    expect(naParede(instante, BUSINESS_TZ).getHours()).toBe(10)
  })

  it('"a partir de agora" é a hora da unidade', () => {
    const agora = new Date('2026-11-14T13:05:00.000Z')
    expect(aPartirDeAgora('2026-11-14', agora, 'America/Manaus')).toBe('09:05')
    expect(aPartirDeAgora('2026-11-14', agora)).toBe('10:05')
  })

  it('o bloqueio e a hora real dizem a hora da unidade', () => {
    const b = { inicio: '2026-11-14T16:00:00.000Z', fim: '2026-11-14T17:00:00.000Z' }
    expect(trechoDoBloqueio(b, 'America/Manaus')).toBe('das 12:00 às 13:00')
    expect(trechoDoBloqueio(b)).toBe('das 13:00 às 14:00')
    expect(textoDoConcluido('2026-11-15T03:30:00.000Z', '2026-11-15T03:50:00.000Z', 'America/Manaus')).toBe('concluído às 23:50')
  })

  it('a chegada é no dia da unidade, e o encaixe pelo relógio dela', () => {
    // 23:30 de Manaus do dia 14 (= 00:30 do dia 15 em Brasília).
    const agendado = '2026-11-15T03:30:00.000Z'
    const agora = new Date('2026-11-15T03:00:00.000Z')
    expect(ehODiaDoAgendamento(agendado, agora, 'America/Manaus')).toBe(true)
    const ate20 = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), [{ de: '08:00', ate: '20:00' }]])) }
    // 19:00 de Manaus (= 23:00 UTC = 20:00 em Brasília): dentro do horário dela.
    expect(foraDoHorarioDaUnidade(ate20, '2026-11-14T23:00:00.000Z', 60, 'America/Manaus')).toBe(false)
    expect(foraDoHorarioDaUnidade(ate20, '2026-11-14T23:00:00.000Z', 60)).toBe(true)
  })
})

describe('o cron no fuso da unidade (F62, fatia 5)', () => {
  it('as 09:00 e o aniversário da campanha são os do relógio dela', async () => {
    const { relogioDaCampanha } = await import('@/lib/notifications/relogio-da-campanha')
    // 12:30 UTC = 09:30 em Brasília, 08:30 em Manaus: a campanha de Manaus ainda espera as 09:00.
    expect(relogioDaCampanha(new Date('2026-11-11T12:30:00.000Z'), 'America/Manaus').hora).toBe(8)
    expect(relogioDaCampanha(new Date('2026-11-11T12:30:00.000Z')).hora).toBe(9)
    // 03:30 UTC do dia 12 = 00:30 do 12 em Brasília, 23:30 do 11 em Manaus: ainda é o aniversário de 11/11 lá.
    const manaus = relogioDaCampanha(new Date('2026-11-12T03:30:00.000Z'), 'America/Manaus')
    expect(manaus.hoje).toEqual({ month: 11, day: 11 })
    expect(manaus.inicioDoDia.toISOString()).toBe('2026-11-11T04:00:00.000Z')
    expect(manaus.mesmoDia(new Date('2026-11-11T05:00:00.000Z'), new Date('2026-11-12T03:30:00.000Z'))).toBe(true)
    expect(relogioDaCampanha(new Date('2026-11-12T03:30:00.000Z')).hoje).toEqual({ month: 11, day: 12 })
  })
})

describe('a mensagem da automação no fuso da unidade (F62, fatia 5)', () => {
  it('"seu horário é 14/11/2026 às 09:00" no relógio de Manaus', async () => {
    const { interpolarTexto } = await import('@/lib/automacoes/variaveis')
    const ctx = { agendamento: { inicio: '2026-11-14T13:00:00.000Z' } }
    // Sem fuso, o de Brasília: como era.
    expect(interpolarTexto('às {{agendamento.inicio}}', ctx)).toBe('às 14/11/2026 às 10:00')
    expect(interpolarTexto('às {{agendamento.inicio}}', ctx, 'America/Manaus')).toBe('às 14/11/2026 às 09:00')
  })
})

describe('as datas do documento no fuso da unidade (F62, fatia 6)', () => {
  it('o termo assinado às 23:30 de Manaus é de 11 de novembro, e o horário é o dela', async () => {
    const { valoresDoDocumento } = await import('@/lib/documentos/valores')
    type Dados = Parameters<typeof valoresDoDocumento>[0]
    const dados = (fuso?: string) => ({
      agora: new Date('2026-11-12T03:30:00.000Z'), fuso,
      cliente: { name: 'Bianca' }, rede: { name: null, document: null, phone: null, email: null },
      unidade: null, procedimento: null, pagamento: null,
      agendamento: { scheduled_at: '2026-11-14T13:00:00.000Z', price: null },
    }) as unknown as Dados
    const manaus = valoresDoDocumento(dados('America/Manaus'))
    expect([manaus['data.hoje'], manaus['data.hoje_curta'], manaus['agendamento.data'], manaus['agendamento.hora']])
      .toEqual(['11 de novembro de 2026', '11/11/2026', '14/11/2026', '09:00'])
    // Sem fuso, o de Brasília: como era.
    const brasilia = valoresDoDocumento(dados())
    expect([brasilia['data.hoje'], brasilia['agendamento.hora']]).toEqual(['12 de novembro de 2026', '10:00'])
  })
})

/**
 * F62b — o que ficou no relógio de Brasília. A Acácia é de Manaus (UTC−4):
 * às 20:30 dela (21:30 em Brasília) o silêncio noturno das 21:00 ainda não
 * começou, e às 23:30 de 11/11 dela (00:30 de 12/11 em Brasília) ainda é o
 * aniversário de 11/11.
 */
describe('as automações no fuso da unidade (F62b)', () => {
  const limites = { silencioDe: '21:00', silencioAte: '08:00' }

  it('o silêncio noturno é o do relógio da cliente', async () => {
    const { noSilencio } = await import('@/lib/automacoes/limites')
    // 00:30Z de 12/11 = 21:30 em Brasília = 20:30 em Manaus.
    const noite = new Date('2026-11-12T00:30:00.000Z')
    expect(noSilencio(limites, noite).dentro, 'Brasília: já é silêncio').toBe(true)
    expect(noSilencio(limites, noite, 'America/Manaus').dentro, 'Manaus: ainda não').toBe(false)
    // 11:30Z = 08:30 em Brasília = 07:30 em Manaus: libera às 08:00 dela (12:00Z).
    const cedo = new Date('2026-11-12T11:30:00.000Z')
    expect(noSilencio(limites, cedo).dentro).toBe(false)
    const manaus = noSilencio(limites, cedo, 'America/Manaus')
    expect(manaus.dentro).toBe(true)
    expect(manaus.liberaEm?.toISOString()).toBe('2026-11-12T12:00:00.000Z')
  })

  it('o gatilho "todo dia às 09:00" é às 09:00 da rede', async () => {
    const { estaNaHora } = await import('@/lib/automacoes/tempo')
    const cfg = { frequencia: 'diaria' as const, hora: '09:00' }
    // 12:30Z = 09:30 em Brasília = 08:30 em Manaus.
    expect(estaNaHora(cfg, null, new Date('2026-11-12T12:30:00.000Z'))).toBe(true)
    expect(estaNaHora(cfg, null, new Date('2026-11-12T12:30:00.000Z'), 'America/Manaus')).toBe(false)
    expect(estaNaHora(cfg, null, new Date('2026-11-12T13:05:00.000Z'), 'America/Manaus')).toBe(true)
    // "Todo dia às 23:00": às 23:30 de 11/11 em Manaus (00:30 do 12 em Brasília) é a hora dele lá;
    // disparado às 23:10 de 10/11 (outro dia lá), sai; às 23:10 de 11/11, já saiu hoje.
    const tarde = { frequencia: 'diaria' as const, hora: '23:00' }
    expect(estaNaHora(tarde, '2026-11-11T03:10:00.000Z', new Date('2026-11-12T03:30:00.000Z'), 'America/Manaus')).toBe(true)
    expect(estaNaHora(tarde, '2026-11-12T03:10:00.000Z', new Date('2026-11-12T03:30:00.000Z'), 'America/Manaus')).toBe(false)
  })

  it('o "faz aniversário hoje" do contexto é o dia da unidade', async () => {
    const { ehAniversarioHoje } = await import('@/lib/automacoes/contexto')
    const noite = new Date('2026-11-12T03:30:00.000Z')
    expect(ehAniversarioHoje('1990-11-11T00:00:00+00:00', noite)).toBe(false)
    expect(ehAniversarioHoje('1990-11-11T00:00:00+00:00', noite, 'America/Manaus')).toBe(true)
  })

  it('a busca "aniversariantes de hoje" pede o dia da rede', async () => {
    const publico = await import('@/lib/clientes/publico')
    const espiao = vi.spyOn(publico, 'lerPublicoAte').mockResolvedValue([])
    const { buscarClientes } = await import('@/lib/automacoes/tempo')
    vi.useFakeTimers({ now: new Date('2026-11-12T03:30:00.000Z'), toFake: ['Date'] })
    try {
      await buscarClientes('rede', { aniversarioHoje: true }, 'America/Manaus')
      expect(espiao.mock.calls.at(-1)?.[1]?.aniversario).toEqual({ mes: 11, dia: 11 })
      await buscarClientes('rede', { aniversarioHoje: true })
      expect(espiao.mock.calls.at(-1)?.[1]?.aniversario).toEqual({ mes: 11, dia: 12 })
    } finally {
      vi.useRealTimers()
      espiao.mockRestore()
    }
  })
})

describe('a rotina da fidelidade no fuso da unidade (F62b)', () => {
  it('o bônus de aniversário pede o "hoje" de cada rede, no fuso dela', async () => {
    const { diasDoBonusDeAniversario } = await import('@/lib/fidelidade/rotina')
    // 03:30Z de 12/11 = 00:30 de 12/11 em Brasília = 23:30 de 11/11 em Manaus.
    const agora = new Date('2026-11-12T03:30:00.000Z')
    expect(diasDoBonusDeAniversario([
      { tenantId: 'manaus', fuso: 'America/Manaus' },
      { tenantId: 'floripa', fuso: 'America/Sao_Paulo' },
    ], agora)).toEqual([
      { p_tenant: 'manaus', p_hoje: '2026-11-11' },
      { p_tenant: 'floripa', p_hoje: '2026-11-12' },
    ])
  })

  it('o aviso "vencem até" diz o dia da unidade', async () => {
    const { textoDoAvisoDeVencimento } = await import('@/lib/fidelidade/rotina')
    // Vencem às 23:30 de 30/11 em Manaus (00:30 de 01/12 em Brasília).
    expect(textoDoAvisoDeVencimento(120, '2026-12-01T03:30:00.000Z', 'America/Manaus'))
      .toBe('120 pontos vencem até 30/11/2026. Use na próxima visita.')
    expect(textoDoAvisoDeVencimento(120, '2026-12-01T03:30:00.000Z'))
      .toBe('120 pontos vencem até 01/12/2026. Use na próxima visita.')
  })
})

describe('o início adiantado no relógio da unidade (F62b)', () => {
  it('"marcado para as 09:00" é a hora de Manaus, e o "não é hoje" é o dia de lá', async () => {
    const { perguntaDoInicioAdiantado, atrasoDoInicio } = await import('@/lib/appointments/inicio-adiantado')
    // 12:30Z = 08:30 em Manaus; o das 09:00 de Manaus é 13:00Z.
    expect(perguntaDoInicioAdiantado('2026-11-14T13:00:00.000Z', new Date('2026-11-14T12:30:00.000Z'), 'America/Manaus'))
      .toBe('O atendimento está marcado para as 09:00 — faltam 30 min. Iniciar mesmo assim?')
    // 23:30 de 13/11 em Manaus (00:30 do 14 em Brasília), o das 09:00 do dia 14 dela: é amanhã lá.
    expect(perguntaDoInicioAdiantado('2026-11-14T13:00:00.000Z', new Date('2026-11-14T03:30:00.000Z'), 'America/Manaus'))
      .toMatch(/^O atendimento está marcado para 14\/11 às 09:00 — falta 1 dia, não é hoje\. Iniciar agora registra o atendimento como feito hoje, 13\/11/)
    expect(atrasoDoInicio('2026-11-14T13:00:00.000Z', '2026-11-14T13:57:00.000Z', 'America/Manaus'))
      .toBe('57 min depois do horário marcado (09:00)')
    // Sem fuso, o de Brasília: como era.
    expect(atrasoDoInicio('2026-11-14T13:00:00.000Z', '2026-11-14T13:57:00.000Z')).toBe('57 min depois do horário marcado (10:00)')
  })
})

describe('o Copilot no relógio da unidade (F62b)', () => {
  // Manaus é UTC−4: 09:00 de lá = 13:00 UTC = 10:00 de Brasília.
  it('o dia, o instante e o "quando" são os da unidade; sem fuso, os de Brasília', async () => {
    const { janelaDoDia, instanteDe, quandoLegivel, hojeNoFuso, horaAgoraNoFuso } = await import('@/lib/copilot/ferramentas/datas')
    expect(janelaDoDia('2026-11-14', 'America/Manaus').inicio.toISOString()).toBe('2026-11-14T04:00:00.000Z')
    expect(janelaDoDia('2026-11-14', 'America/Manaus').fim.toISOString()).toBe('2026-11-15T03:59:59.999Z')
    expect(janelaDoDia('2026-11-14').inicio.toISOString()).toBe('2026-11-14T03:00:00.000Z')
    // "Agende às 14:30" na unidade de Manaus é 14:30 DE LÁ (era 13:30 de lá).
    expect(instanteDe('2026-11-14', '14:30', 'America/Manaus').toISOString()).toBe('2026-11-14T18:30:00.000Z')
    expect(instanteDe('2026-11-14', '14:30').toISOString()).toBe('2026-11-14T17:30:00.000Z')
    expect(quandoLegivel('2026-11-14T13:00:00.000Z', 'America/Manaus')).toMatch(/14\/11 às 09:00$/)
    expect(quandoLegivel('2026-11-14T13:00:00.000Z')).toMatch(/14\/11 às 10:00$/)
    // 23:30 de 13/11 em Manaus = 00:30 de 14/11 em Brasília.
    const agora = new Date('2026-11-14T03:30:00.000Z')
    expect(hojeNoFuso('America/Manaus', agora)).toBe('2026-11-13')
    expect(hojeNoFuso(undefined, agora)).toBe('2026-11-14')
    expect(horaAgoraNoFuso('America/Manaus', agora)).toBe('23:30')
  })

  it('o "Agora" do prompt diz a hora e o dia da unidade, e o nome do fuso', async () => {
    const { agoraLegivel } = await import('@/lib/copilot/ferramentas/datas')
    const agora = new Date('2026-11-14T03:30:00.000Z')
    const manaus = agoraLegivel(agora, 'America/Manaus')
    expect(manaus).toMatch(/13 de novembro de 2026, 23:30 \(horário de Manaus; hoje em ISO: 2026-11-13\)$/)
    expect(agoraLegivel(agora)).toMatch(/14 de novembro de 2026, 00:30 \(horário de Brasília; hoje em ISO: 2026-11-14\)$/)
  })

  it('os clientes novos contam o "cliente desde" pelo dia da unidade', async () => {
    const { filtroDosClientesNovos, ehClienteNova } = await import('@/lib/copilot/clientes-novos')
    const desde = new Date('2026-11-14T03:30:00.000Z') // 13/11 em Manaus, 14/11 em Brasília
    expect(filtroDosClientesNovos(desde, 'America/Manaus')).toContain('cliente_desde.gte.2026-11-13')
    expect(filtroDosClientesNovos(desde)).toContain('cliente_desde.gte.2026-11-14')
    expect(ehClienteNova({ clienteDesde: '2026-11-13', createdAt: null }, desde, 'America/Manaus')).toBe(true)
    expect(ehClienteNova({ clienteDesde: '2026-11-13', createdAt: null }, desde)).toBe(false)
  })
})

describe('a validade do lote no dia da unidade (F62b)', () => {
  it('às 23:30 de 14/11 em Manaus o lote de 14/11 ainda vale (em Brasília já é 15/11)', async () => {
    const { loteVencido, venceAte } = await import('@/lib/estoque/validade')
    const agora = new Date('2026-11-15T03:30:00.000Z')
    expect(loteVencido('2026-11-14T00:00:00+00:00', agora, 'America/Manaus')).toBe(false)
    expect(loteVencido('2026-11-14T00:00:00+00:00', agora)).toBe(true)
    expect(venceAte('2026-11-15T00:00:00+00:00', agora, 'America/Manaus')).toBe(false)
    expect(venceAte('2026-11-15T00:00:00+00:00', agora)).toBe(true)
  })
})

describe('o FEFO e os lotes vencendo no dia da unidade (F62b)', () => {
  it('às 23:30 de 14/11 em Manaus o lote de 14/11 ainda sai primeiro, e o de 14/12 vence "em 30 dias"', async () => {
    const { lotesDaBaixa } = await import('@/lib/estoque/fefo')
    const { lotesVencendo } = await import('@/lib/estoque/lotes')
    const agora = new Date('2026-11-15T03:30:00.000Z')
    const lotes = [
      { id: 'a', numero: 'A', validade: '2026-11-14T00:00:00+00:00', recebidoEm: '2026-01-01', quantidade: 1 },
      { id: 'b', numero: 'B', validade: '2026-12-31T00:00:00+00:00', recebidoEm: '2026-01-01', quantidade: 1 },
    ]
    expect(lotesDaBaixa(lotes, 1, 1, agora, 'America/Manaus')[0]!.id).toBe('a')
    expect(lotesDaBaixa(lotes, 1, 1, agora)[0]!.id).toBe('b')
    const doProduto = [{ id: 'c', produtoId: 'p', unidadeId: 'u', numero: null, validade: '2026-12-15T00:00:00+00:00', quantidade: 1, custoPorEmbalagem: null, origemDoCusto: null }]
    const em30 = new Date(agora.getTime() + 30 * 86_400_000) // 14/12 23:30 em Manaus, 15/12 00:30 em Brasília
    expect(lotesVencendo(doProduto, em30, 'America/Manaus')).toHaveLength(0)
    expect(lotesVencendo(doProduto, em30)).toHaveLength(1)
  })
})

// O núcleo do lançamento importa a autorização (cookies, Next); aqui só a data.
vi.mock('@/lib/auth', () => ({ alcancaUnidade: () => true }))

describe('as telas, o recibo e os CSV no relógio da unidade (F62b)', () => {
  // 23:30 de 10/03 em Manaus = 00:30 de 11/03 em Brasília.
  const I = '2026-03-11T03:30:00.000Z'
  const M = 'America/Manaus'

  it('o CSV dos lançamentos e o do extrato de comissões saem no dia da unidade', async () => {
    const { csvDosLancamentos } = await import('@/lib/financeiro/csv-dos-lancamentos')
    const { csvDoExtrato } = await import('@/lib/comissoes/extrato-texto')
    const linha = { data: I, descricao: 'Botox', cliente: null, categoria: null, tipo: 'INCOME', forma: null, vezes: null, situacao: 'PAGO' as const, valor: 10, pagoEm: I }
    const corpo = (csv: string) => csv.split('\r\n')[1]!
    expect(corpo(csvDosLancamentos([linha], M))).toMatch(/^10\/03\/2026;.*;10\/03\/2026;;$/)
    expect(corpo(csvDosLancamentos([linha]))).toMatch(/^11\/03\/2026;/)
    const extrato = {
      id: 'x', professionalId: 'p', branchId: 'b', releasedAt: I, kind: 'LIBERACAO', motivo: null, amount: 10, status: 'PAID',
      payoutId: null, appointmentId: null, scheduledAt: I, cliente: null, procedimento: null, origem: null, preco: null,
      regraTipo: null, regraValor: null, pacote: null, descontaTaxa: false, descontaInsumos: false, previsto: null,
      baseComPontos: null, plano: null, base: null, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1, pagoEm: I,
    } as unknown as Parameters<typeof csvDoExtrato>[0][number]
    const ext = corpo(csvDoExtrato([extrato], new Map(), new Map(), M))
    expect(ext.startsWith('10/03/2026;')).toBe(true)
    expect(ext.endsWith(';10/03/2026')).toBe(true)
    expect(corpo(csvDoExtrato([extrato], new Map(), new Map())).startsWith('11/03/2026;')).toBe(true)
  })

  it('a busca, a anamnese, o avulso do plano, o arquivar e o cancelamento do plano dizem a hora da unidade', async () => {
    const { quandoLegivel } = await import('@/lib/busca/formatar')
    const { quemRespondeu } = await import('@/lib/anamnese-geral')
    const { textoDoAvulso } = await import('@/lib/checkout/plano-e-avulso')
    const { avisoDosAgendamentosAoArquivar } = await import('@/lib/clients/textos-do-cadastro')
    const { retratoDoCancelamento } = await import('@/lib/plano-de-tratamento/retrato-do-cancelamento')
    expect(quandoLegivel(I, M)).toMatch(/10\/03 às 23:30$/)
    expect(quandoLegivel(I)).toMatch(/11\/03 às 00:30$/)
    const anamnese = { respondidoEm: I, origem: 'EQUIPE' } as unknown as Parameters<typeof quemRespondeu>[0]
    expect(quemRespondeu(anamnese, M)).toBe('Respondida pela equipe em 10/03/2026')
    expect(quemRespondeu(anamnese)).toBe('Respondida pela equipe em 11/03/2026')
    expect(textoDoAvulso({ id: 'a', procedimento: 'Bio', scheduledAt: I, preco: 100 }, M)).toContain('10/03 às 23:30')
    expect(avisoDosAgendamentosAoArquivar([{ scheduledAt: I, status: 'SCHEDULED' }], new Date('2026-03-01T12:00:00Z'), M)).toContain('(10/03 às 23:30)')
    expect(retratoDoCancelamento({ cancelado_em: I }, M)?.quando).toBe('Cancelado em 10/03/2026 às 23:30.')
    expect(retratoDoCancelamento({ cancelado_em: I })?.quando).toBe('Cancelado em 11/03/2026 às 00:30.')
  })

  it('o prêmio da indicação, o prazo da LGPD, o horário passado e a comunicação do pacote LGPD', async () => {
    const { situacaoDoPremio } = await import('@/lib/fidelidade/indicacao')
    const { prazoDeResposta } = await import('@/lib/lgpd/prazo')
    // O Heitor, 25/11: o horário passado no remarcar passou de aviso a recusa ("recusa, não dá pra agendar no passado"); o fuso da mensagem é o mesmo.
    const { recusaDoHorarioPassado } = await import('@/lib/appointments/horario-passado')
    const { linhaDaComunicacao } = await import('@/lib/lgpd/plano')
    const regra = { fidelidadeLigada: true, premio: 'PONTOS' as const }
    const indicada = { id: 'i', nome: 'Ana', premioEm: I, estornadoEm: null, jaPagou: true }
    expect(situacaoDoPremio(indicada, regra, M)).toBe('prêmio dado em 10/03')
    expect(situacaoDoPremio(indicada, regra)).toBe('prêmio dado em 11/03')
    // 15 dias do pedido: 25/03 em Manaus (em Brasília, 26/03 — um dia a mais de prazo que não existe).
    expect(prazoDeResposta(I, true, M)).toBe('25/03/2026')
    expect(prazoDeResposta(I, true)).toBe('26/03/2026')
    expect(recusaDoHorarioPassado(I, new Date('2026-04-01T12:00:00Z'), M)).toContain('às 23:30)')
    expect(linhaDaComunicacao({ created_at: I, title: 'Oi' }, M)).toMatch(/^10\/03\/2026.*23:30 — Oi$/)
  })

  it('o "hoje" do pagamento, o dia da conversa, a idade do lead e o nome do CSV de vendas', async () => {
    const { pagoNoDia } = await import('@/lib/financeiro/lancamento')
    const { agruparPorDia } = await import('@/lib/inbox/dias-da-conversa')
    const { idadeDoLead } = await import('@/lib/crm/idade-do-lead')
    const { nomeDoCsvDeVendas } = await import('@/lib/metrics/vendas-comum')
    // Pago "hoje" em Manaus (10/03) é o instante de agora, não a âncora do meio-dia.
    expect(pagoNoDia('2026-03-10', new Date(I), M)).toBe(I)
    expect(pagoNoDia('2026-03-10', new Date(I))).not.toBe(I)
    expect(agruparPorDia([{ created_at: I }], M)[0]!.date).toBe('2026-03-10')
    expect(agruparPorDia([{ created_at: I }])[0]!.date).toBe('2026-03-11')
    expect(idadeDoLead('2026-03-10T15:00:00.000Z', new Date(I), M)).toBe('hoje')
    expect(idadeDoLead('2026-03-10T15:00:00.000Z', new Date(I))).toBe('ontem')
    const p = resolvePeriod('month', undefined, undefined, new Date('2026-03-15T12:00:00Z'), M)
    expect(nomeDoCsvDeVendas(p.from, p.fullTo, M)).toBe('vendas-2026-03-01-a-2026-03-31.csv')
  })
})

describe('no consolidado, cada registro no dia e na hora da unidade dele, e a tela diz o relógio fora do de Brasília (F62; indicadores.md)', () => {
  // A Rede Mimosa: Setor Bueno e Jardim Goiás no horário de Brasília (UTC−3), Cuiabá Centro no de Cuiabá (UTC−4).
  const SP = 'America/Sao_Paulo'
  const CB = 'America/Cuiaba'
  const WEB = path.resolve(__dirname, '..')
  const fonte = (...p: string[]) => fs.readFileSync(path.join(WEB, ...p), 'utf8')
  // 18:55 em Cuiabá = 19:55 em Goiânia (22:55 UTC).
  const AS_1855_EM_CUIABA = '2026-11-18T22:55:00.000Z'

  describe('o atendimento de outra unidade sai na hora DELA, dizendo o relógio', () => {
    it('horaNaUnidadeDele: a hora no relógio da unidade do agendamento, e o nome do relógio quando não é o da tela', async () => {
      const { horaNaUnidadeDele, comORelogio } = await import('@/lib/unidades/hora-da-unidade')
      expect(horaNaUnidadeDele(AS_1855_EM_CUIABA, CB, SP)).toEqual({ hora: '18:55', relogio: 'horário de Cuiabá' })
      // No mesmo relógio da tela, nada a dizer.
      expect(horaNaUnidadeDele(AS_1855_EM_CUIABA, SP, SP)).toEqual({ hora: '19:55', relogio: null })
      expect(horaNaUnidadeDele(AS_1855_EM_CUIABA, CB, CB)).toEqual({ hora: '18:55', relogio: null })
      // A tela de Cuiabá olhando um de Goiânia: diz o de Brasília.
      expect(horaNaUnidadeDele(AS_1855_EM_CUIABA, SP, CB)).toEqual({ hora: '19:55', relogio: 'horário de Brasília' })
      expect(comORelogio(horaNaUnidadeDele(AS_1855_EM_CUIABA, CB, SP))).toBe('18:55 (horário de Cuiabá)')
      expect(comORelogio(horaNaUnidadeDele(AS_1855_EM_CUIABA, SP, SP))).toBe('19:55')
    })

    it('a Minha agenda escreve a hora do cartão de fora pela unidade dele (a grade continua no relógio do portal)', () => {
      const agenda = fonte('components', 'branch', 'professional-agenda.tsx')
      expect(agenda).toMatch(/horaNaUnidadeDele\(/)
      expect(agenda).toMatch(/fusoDaUnidade/)
      // A página manda o fuso da unidade de cada um de fora.
      expect(fonte('app', '[slug]', 'agenda', 'page.tsx')).toMatch(/fusoDaUnidade:\s/)
    })

    it('"Seus atendimentos em outras unidades" sai no relógio de cada uma (era sempre o de Brasília)', () => {
      const lista = fonte('components', 'branch', 'meus-de-outras-unidades.tsx')
      expect(lista).not.toMatch(/partsInTZ\(new Date\(e\.start\)\)/)
      expect(lista).toMatch(/horaNaUnidadeDele\(/)
    })

    it('a "Agenda de hoje" do dashboard da unidade diz a hora de fora no relógio dela', () => {
      const dash = fonte('app', '[slug]', 'dashboard', 'page.tsx')
      expect(dash).toMatch(/horaNaUnidadeDele\(a\.scheduled_at/)
    })
  })

  describe('o Início do app da cliente: cada agendamento no fuso da unidade dele', () => {
    it('o próximo, os para avaliar e as sessões do plano leem o fuso da unidade do agendamento', () => {
      const home = fonte('app', '[slug]', 'cliente', 'home', 'page.tsx')
      expect(home).toMatch(/branches\(name, address, city, state, is_active, fuso\)/)
      expect(home).toMatch(/fmtDateTime\(nextAppt\.scheduled_at, fusoDoAgendamento\(nextAppt\)\)/)
      expect(home).not.toMatch(/fmtDateTime\(nextAppt\.scheduled_at, fuso\)/)
    })
  })

  describe('o "Hoje" da rede é a soma do dia de cada unidade', () => {
    it('janelasDoDiaNasUnidades: o dia da rede, no relógio de cada unidade', async () => {
      const { janelasDoDiaNasUnidades } = await import('@/lib/metrics/agenda-do-dia')
      // 18/11 às 23:45 em Brasília (02:45 UTC de 19/11): o dia da rede é 18/11.
      const agora = new Date('2026-11-19T02:45:00.000Z')
      const janelas = janelasDoDiaNasUnidades(agora, SP, [
        { id: 'bueno', fuso: SP }, { id: 'goias', fuso: SP }, { id: 'cuiaba', fuso: CB },
      ])
      expect(janelas).toHaveLength(2)
      const deSP = janelas.find(j => j.fuso === SP)!
      const deCB = janelas.find(j => j.fuso === CB)!
      expect(deSP.ids).toEqual(['bueno', 'goias'])
      expect(deCB.ids).toEqual(['cuiaba'])
      expect(deSP.de.toISOString()).toBe('2026-11-18T03:00:00.000Z')
      expect(deCB.de.toISOString()).toBe('2026-11-18T04:00:00.000Z')
      // A avaliação das 23:30 de Cuiabá (03:30 UTC de 19/11) cai no 18/11 dela.
      const avaliacao = new Date('2026-11-19T03:30:00.000Z').getTime()
      expect(avaliacao >= deCB.de.getTime() && avaliacao <= deCB.ate.getTime()).toBe(true)
      expect(avaliacao <= deSP.ate.getTime()).toBe(false)
    })

    it('o dashboard da rede lê os de hoje pela janela de cada unidade', () => {
      const dash = fonte('app', 'admin', 'dashboard', 'page.tsx')
      expect(dash).toMatch(/agendamentosDeHojeNasUnidades\(/)
      expect(dash).not.toMatch(/\.gte\('scheduled_at', startOfToday\.toISOString\(\)\)/)
    })

    it('a migration põe o agendamento no dia da unidade dele no núcleo, na aba Agenda e no "por unidade"', () => {
      const dir = path.resolve(WEB, '..', '..', 'supabase', 'migrations')
      const nome = fs.readdirSync(dir).find(f => f.startsWith('20261130100001_'))
      expect(nome).toBeTruthy()
      const sql = fs.readFileSync(path.join(dir, nome!), 'utf8')
      expect(sql).toMatch(/create or replace function public\.metrics_no_dia_da_unidade/)
      expect(sql).toMatch(/metrics_core\(uuid,uuid\[\],timestamptz,timestamptz,uuid,text\[\]\)/)
      expect(sql).toMatch(/metrics_relatorio\(uuid,uuid\[\],timestamptz,timestamptz,timestamptz,timestamptz,text,text,uuid,text\[\]\)/)
      expect(sql).toMatch(/metrics_by_branch\(uuid,timestamptz,timestamptz\)/)
      expect(sql).toMatch(/create or replace function pg_temp\./)
      expect(sql).not.toMatch(/create function pg_temp\./)
      expect(sql).toMatch(/revoke execute on function public\.metrics_no_dia_da_unidade/)
      expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`)).toBe(true)
    })
  })

})

describe('o app da cliente, a Equipe e as Unidades dizem o relógio fora do de Brasília (F62, princípio 3)', () => {
  const SP = 'America/Sao_Paulo'
  const CB = 'America/Cuiaba'
  const WEB = path.resolve(__dirname, '..')
  const fonte = (...p: string[]) => fs.readFileSync(path.join(WEB, ...p), 'utf8')

  describe('o app da cliente diz o relógio fora de Brasília', () => {
    it('Início, Agenda, agendar e remarcar têm a NotaDoFuso', () => {
      expect(fonte('app', '[slug]', 'cliente', 'home', 'page.tsx')).toMatch(/NotaDoFuso/)
      expect(fonte('app', '[slug]', 'cliente', 'agendamentos', 'page.tsx')).toMatch(/NotaDoFuso/)
      expect(fonte('app', '[slug]', 'cliente', 'agendamentos', '[id]', 'page.tsx')).toMatch(/NotaDoFuso/)
      expect(fonte('components', 'client-portal', 'new-appointment-wizard.tsx')).toMatch(/NotaDoFuso/)
      expect(fonte('components', 'client-portal', 'alterar-agendamento.tsx')).toMatch(/NotaDoFuso/)
    })
  })

  describe('o prazo do remarcar é o do agendamento original, no relógio dele', () => {
    it('o "até…" não muda com a unidade escolhida', () => {
      const alterar = fonte('components', 'client-portal', 'alterar-agendamento.tsx')
      expect(alterar).toMatch(/limiteParaAlterar\(scheduledAt, prazoHoras, fusoDoAgendamento\)/)
      expect(alterar).toMatch(/<NotaDoFuso fuso=\{fusoDoAgendamento\}/)
    })
  })

  describe('o horário próprio diz em que relógio vale', () => {
    it('textoDoRelogioDoHorario: nada em Brasília; o relógio quando é um só; cada unidade quando são vários', async () => {
      const { textoDoRelogioDoHorario } = await import('@/lib/unidades/hora-da-unidade')
      expect(textoDoRelogioDoHorario([{ nome: 'Setor Bueno', fuso: SP }])).toBeNull()
      expect(textoDoRelogioDoHorario([])).toBeNull()
      expect(textoDoRelogioDoHorario([{ nome: 'Cuiabá Centro', fuso: CB }])).toBe('No horário de Cuiabá.')
      expect(textoDoRelogioDoHorario([{ nome: 'Setor Bueno', fuso: SP }, { nome: 'Cuiabá Centro', fuso: CB }]))
        .toBe('Vale no relógio de cada unidade: Setor Bueno no horário de Brasília, Cuiabá Centro no horário de Cuiabá.')
    })

    it('a edição do membro mostra o texto pelas unidades em que atende', () => {
      const edit = fonte('components', 'admin', 'team-member-edit.tsx')
      expect(edit).toMatch(/textoDoRelogioDoHorario\(/)
      expect(edit).toMatch(/data-relogio-do-horario/)
      expect(fonte('app', 'admin', 'team', 'page.tsx')).toMatch(/fusos=\{/)
      expect(fonte('app', '[slug]', 'team', 'page.tsx')).toMatch(/fusos=\{/)
    })
  })

  describe('o cartão da unidade diz o fuso quando não é o de Brasília', () => {
    it('a lista de Unidades lê o fuso e o mostra só fora de Brasília', () => {
      const lista = fonte('components', 'admin', 'settings-branches.tsx')
      expect(lista).toMatch(/is_active, created_at, fuso/)
      expect(lista).toMatch(/data-fuso-da-unidade/)
      expect(lista).toMatch(/relogioForaDeBrasilia\(/)
    })

    it('relogioForaDeBrasilia: o nome, só fora de Brasília', async () => {
      const { relogioForaDeBrasilia } = await import('@/lib/unidades/hora-da-unidade')
      expect(relogioForaDeBrasilia(SP)).toBeNull()
      expect(relogioForaDeBrasilia(null)).toBeNull()
      expect(relogioForaDeBrasilia(CB)).toBe('Horário de Cuiabá')
    })
  })
})
