import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { separarAgendaDoPortal, emAndamento } from '@/lib/clientes/agenda-do-portal'

// O Heitor, 25/11 (o atendimento pode durar mais de um dia): "Um "Em
// andamento" não seria melhor?", e a regra que ele aprovou: "Em aberto, com o
// início já passado e o fim ainda por vir, de qualquer dia (o de 30 horas que
// começou ontem entra). Sai dali quando a equipe conclui ou quando o horário
// acaba. O que acabou sem ser fechado segue a regra de hoje: fica em
// "Próximos" com "o horário passou" até o fim do dia, depois vai ao
// Histórico. A home mostra "Em andamento" no lugar de "Próximo agendamento"
// enquanto ele dura."
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o "Em andamento" do portal da cliente', () => {
  const agora = new Date('2026-11-25T15:00:00-03:00')
  const a = (id: string, status: string, quando: string, duration_min: number | null = 60) =>
    ({ id, status, scheduled_at: quando, duration_min })
  const lista = [
    a('depois', 'SCHEDULED', '2026-11-26T10:00:00-03:00'),
    a('trinta-horas-de-ontem', 'IN_PROGRESS', '2026-11-24T14:00:00-03:00', 30 * 60),
    a('hoje-agora', 'CONFIRMED', '2026-11-25T14:30:00-03:00'),
    a('duracao-nula', 'ARRIVED', '2026-11-25T14:10:00-03:00', null),
    a('comeca-agora', 'SCHEDULED', '2026-11-25T15:00:00-03:00'),
    a('acaba-agora', 'SCHEDULED', '2026-11-25T14:00:00-03:00'),
    a('hoje-acabou', 'SCHEDULED', '2026-11-25T10:00:00-03:00'),
    a('ontem-acabou-hoje', 'IN_PROGRESS', '2026-11-24T22:00:00-03:00', 600),
    a('concluido-no-horario', 'COMPLETED', '2026-11-25T14:00:00-03:00', 120),
    a('cancelado-no-horario', 'CANCELLED', '2026-11-25T14:30:00-03:00'),
    a('falta-no-horario', 'NO_SHOW', '2026-11-25T14:30:00-03:00'),
  ]

  it('é o em aberto com o início passado e o fim por vir, de qualquer dia, do que começou antes ao de depois', () => {
    expect(separarAgendaDoPortal(lista, agora).emAndamento.map(x => x.id))
      .toEqual(['trinta-horas-de-ontem', 'duracao-nula', 'hoje-agora', 'comeca-agora'])
  })
  it('o fim é o da ocupação: a duração nula vale 60 minutos, e o que acaba agora já acabou', () => {
    expect(emAndamento(a('x', 'ARRIVED', '2026-11-25T14:10:00-03:00', null), agora)).toBe(true)
    expect(emAndamento(a('x', 'ARRIVED', '2026-11-25T13:59:00-03:00', null), agora)).toBe(false)
    expect(emAndamento(a('x', 'SCHEDULED', '2026-11-25T14:00:00-03:00'), agora)).toBe(false)
    expect(emAndamento(a('x', 'SCHEDULED', '2026-11-25T15:00:00-03:00'), agora)).toBe(true)
    expect(emAndamento(a('x', 'SCHEDULED', '2026-11-25T15:01:00-03:00'), agora), 'ainda não começou').toBe(false)
  })
  it('sai quando a equipe conclui (ou cancela, ou marca a falta)', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'NO_SHOW']) {
      expect(emAndamento(a('x', status, '2026-11-25T14:30:00-03:00'), agora), status).toBe(false)
    }
  })
  it('o que acabou sem ser fechado segue a regra de hoje: o de hoje em "Próximos", o de antes no Histórico', () => {
    const { proximos, historico } = separarAgendaDoPortal(lista, agora)
    expect(proximos.map(x => x.id)).toEqual(['hoje-acabou', 'acaba-agora', 'depois'])
    expect(historico.map(x => x.id).sort()).toEqual(
      ['cancelado-no-horario', 'concluido-no-horario', 'falta-no-horario', 'ontem-acabou-hoje'].sort())
  })
  it('nada se repete entre os três, e nada some', () => {
    const { emAndamento: andamento, proximos, historico } = separarAgendaDoPortal(lista, agora)
    const ids = [...andamento, ...proximos, ...historico].map(x => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(lista.length)
  })
})

describe('as telas do portal mostram o "Em andamento"', () => {
  it('a Agenda tem o grupo "Em andamento" acima de "Próximos", só quando tem algo', () => {
    const pagina = fonte('app/[slug]/cliente/agendamentos/page.tsx')
    expect(pagina).toMatch(/emAndamento/)
    expect(pagina).toMatch(/andamento\.length > 0 &&/)
    const grupo = pagina.indexOf('<GroupLabel>Em andamento</GroupLabel>')
    expect(grupo).toBeGreaterThan(-1)
    expect(grupo).toBeLessThan(pagina.indexOf('<GroupLabel>Próximos</GroupLabel>'))
  })
  it('a home mostra "Em andamento" no lugar de "Próximo agendamento" enquanto ele dura, pela mesma regra', () => {
    const pagina = fonte('app/[slug]/cliente/home/page.tsx')
    expect(pagina).toContain('separarAgendaDoPortal(')
    expect(pagina).toContain("'Em andamento'")
    expect(pagina).toContain('data-em-andamento')
  })
})
