import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { podemOcuparDesde } from '@/lib/appointments/core'
import { STATUS_EM_ABERTO } from '@/lib/agenda/em-andamento'
import * as daEquipe from '@/lib/agenda/em-andamento-da-equipe'
import * as minhaAgenda from '@/lib/agenda/minha-agenda'

/**
 * O "Em andamento" nas telas da equipe (o Heitor, 25/11: "Acho que seria mais
 * útil para rede/clínica. A cliente vai estar sendo atendida não vai ficar
 * vendo o app durante o atendimento, mas pode manter lá."; e a proposta que
 * ele aprovou: cada bloco mostra "quem está sendo atendido, por quem, em qual
 * sala, desde quando e até quando; só aparece quando houver algo; segue a
 * abrangência e a permissão da Agenda (na Minha agenda, a vista pessoal: só os
 * dela)").
 *
 * Quatro telas: o painel da unidade (no topo da "Agenda de hoje"), o painel da
 * rede (as unidades juntas, com a unidade em cada linha), a Agenda (uma faixa
 * acima da grade, no dia e na semana, na unidade e na rede) e a Minha agenda
 * (o que ela tem em andamento agora — junto do destaque, sem um segundo bloco).
 *
 * A regra é UMA: `emAndamento` (lib/agenda/em-andamento.ts). O atendimento de
 * 30 horas que começou anteontem entra; o que acabou, o concluído e o que
 * ainda vai começar, não.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
const AGORA = new Date('2026-12-10T14:30:00-03:00')
const FUSO = 'America/Sao_Paulo'

type Linha = daEquipe.LinhaDoEmAndamento
const linha = (id: string, inicio: string, duration_min: number | null, status: string, extra: Partial<Linha> = {}): Linha => ({
  id, status, scheduled_at: new Date(`${inicio}-03:00`).toISOString(), duration_min,
  clients: { name: `Cliente ${id}` }, procedures: { name: 'Limpeza de pele' },
  users: { name: 'Ana' }, rooms: { name: 'Sala 2' }, branches: { name: 'Centro', fuso: FUSO },
  ...extra,
})

const LINHAS: Linha[] = [
  linha('agora', '2026-12-10T14:00:00', 60, 'ARRIVED'),
  // 30 h desde as 10:00 de 09/12: até as 16:00 de 10/12.
  linha('longo', '2026-12-09T10:00:00', 30 * 60, 'IN_PROGRESS', { rooms: null, branches: { name: 'Savassi', fuso: FUSO } }),
  linha('acabou', '2026-12-10T12:00:00', 60, 'CONFIRMED'),
  linha('concluido', '2026-12-10T14:00:00', 60, 'COMPLETED'),
  linha('cancelado', '2026-12-10T14:00:00', 60, 'CANCELLED'),
  linha('depois', '2026-12-10T15:00:00', 60, 'SCHEDULED'),
]

describe('o que está em andamento agora, para as telas da equipe', () => {
  it('é a regra de emAndamento: o longo de antes entra; o que acabou, o concluído, o cancelado e o que vem depois, não', () => {
    const itens = daEquipe.paraOEmAndamento(LINHAS, AGORA)
    expect(itens.map(i => i.id), 'do início mais antigo ao mais novo').toEqual(['longo', 'agora'])
  })

  it('cada linha diz quem está sendo atendido, por quem, em qual sala, em qual unidade e até quando', () => {
    const [longo, agora] = daEquipe.paraOEmAndamento(LINHAS, AGORA)
    expect(agora).toMatchObject({ cliente: 'Cliente agora', quemAtende: 'Ana', sala: 'Sala 2', unidade: 'Centro', procedimento: 'Limpeza de pele' })
    expect(agora!.ate).toBe(new Date('2026-12-10T15:00:00-03:00').toISOString())
    expect(longo).toMatchObject({ sala: null, unidade: 'Savassi' })
    expect(longo!.ate).toBe(new Date('2026-12-10T16:00:00-03:00').toISOString())
  })

  it('desde quando e até quando, no relógio da unidade; de outro dia, com a data', () => {
    const [longo, agora] = daEquipe.paraOEmAndamento(LINHAS, AGORA)
    expect(daEquipe.quandoDoEmAndamento(agora!, AGORA)).toEqual({ desde: 'desde 14:00', ate: 'até 15:00' })
    expect(daEquipe.quandoDoEmAndamento(longo!, AGORA)).toEqual({ desde: 'desde 09/12 10:00', ate: 'até 16:00' })
  })

  it('na tela aberta, sai da lista quando o horário acaba (o relógio anda)', () => {
    const itens = daEquipe.paraOEmAndamento(LINHAS, AGORA)
    expect(daEquipe.osEmAndamento(itens, new Date('2026-12-10T15:30:00-03:00')).map(i => i.id)).toEqual(['longo'])
    expect(daEquipe.osEmAndamento(itens, new Date('2026-12-10T16:00:00-03:00'))).toEqual([])
  })
})

// ─── A leitura do servidor ──────────────────────────────────────────────────

const chamadas: { metodo: string; args: unknown[] }[] = []
vi.mock('@/lib/supabase/admin', () => {
  const consulta: Record<string, unknown> = {}
  for (const metodo of ['from', 'select', 'in', 'eq', 'or', 'lte', 'gte', 'order']) {
    consulta[metodo] = (...args: unknown[]) => { chamadas.push({ metodo, args }); return consulta }
  }
  consulta.range = (...args: unknown[]) => { chamadas.push({ metodo: 'range', args }); return Promise.resolve({ data: LINHAS, error: null }) }
  return { createAdminClient: () => consulta }
})

describe('lerEmAndamento: a leitura que as quatro telas usam', () => {
  beforeEach(() => { chamadas.length = 0 })
  const de = (metodo: string) => chamadas.filter(c => c.metodo === metodo).map(c => c.args)

  it('lê os em aberto das unidades pedidas, da rede, de qualquer duração (podemOcuparDesde) e já começados', async () => {
    const { lerEmAndamento } = await import('@/lib/agenda/ler-em-andamento')
    const itens = await lerEmAndamento({ tenantId: 'rede-1', unidades: ['u1', 'u2'], agora: AGORA })
    expect(de('in')).toContainEqual(['branch_id', ['u1', 'u2']])
    expect(de('in')).toContainEqual(['status', [...STATUS_EM_ABERTO]])
    expect(de('eq')).toContainEqual(['branches.tenant_id', 'rede-1'])
    expect(de('or')).toContainEqual([podemOcuparDesde(AGORA.getTime())])
    expect(de('lte')).toContainEqual(['scheduled_at', AGORA.toISOString()])
    expect(de('eq').some(([coluna]) => coluna === 'professional_id'), 'sem a vista pessoal, de todos').toBe(false)
    expect(itens.map(i => i.id)).toEqual(['longo', 'agora'])
  })

  it('na vista pessoal, só os dela', async () => {
    const { lerEmAndamento } = await import('@/lib/agenda/ler-em-andamento')
    await lerEmAndamento({ tenantId: 'rede-1', unidades: ['u1'], profissional: 'ela', agora: AGORA })
    expect(de('eq')).toContainEqual(['professional_id', 'ela'])
  })

  it('sem unidade nenhuma, não consulta', async () => {
    const { lerEmAndamento } = await import('@/lib/agenda/ler-em-andamento')
    expect(await lerEmAndamento({ tenantId: 'rede-1', unidades: [], agora: AGORA })).toEqual([])
    expect(chamadas).toEqual([])
  })
})

// ─── A Minha agenda: junto do destaque, não um segundo bloco ────────────────

describe('a Minha agenda mostra o que ela tem em andamento no destaque', () => {
  // A grade da Minha agenda trabalha "na parede" (TZ=UTC aqui).
  const ev = (id: string, start: string, durationMin: number, status: string, roomName?: string) =>
    ({ id, start, end: start, durationMin, status, clientName: `Cliente ${id}`, procedureName: 'P', professionalId: 'ela', professionalName: '', roomName })
  const agora = new Date('2026-12-10T14:30:00')

  it('o destaque em andamento diz até quando; o que é do dia seguinte, com a data', () => {
    const d = minhaAgenda.destaqueDaMinhaAgenda([ev('a', '2026-12-10T14:00:00', 60, 'IN_PROGRESS', 'Sala 2')], agora)
    expect(d).toMatchObject({ label: 'Em atendimento agora', ate: 'até 15:00' })
    const longo = minhaAgenda.destaqueDaMinhaAgenda([ev('b', '2026-12-08T10:00:00', 72 * 60, 'CONFIRMED')], agora)
    expect(longo, 'o de 72 h que começou anteontem também está em andamento').toMatchObject({ continuaDeAntes: true, ate: 'até 11/12 10:00' })
  })

  it('o próximo não tem "até" (não está em andamento)', () => {
    const d = minhaAgenda.destaqueDaMinhaAgenda([ev('c', '2026-12-10T16:00:00', 60, 'SCHEDULED')], agora)
    expect(d).toMatchObject({ label: 'Próximo atendimento', ate: null, tambemEmAndamento: [] })
  })

  it('o outro em andamento ao mesmo tempo vem junto do destaque, pela regra de emAndamento', () => {
    const d = minhaAgenda.destaqueDaMinhaAgenda([
      ev('a', '2026-12-10T14:00:00', 60, 'IN_PROGRESS'),
      ev('b', '2026-12-10T14:15:00', 60, 'ARRIVED'),
      ev('acabou', '2026-12-10T13:00:00', 60, 'ARRIVED'),
      ev('feito', '2026-12-10T14:00:00', 60, 'COMPLETED'),
    ], agora)
    expect(d?.ev.id).toBe('a')
    expect(d?.tambemEmAndamento.map(e => e.id)).toEqual(['b'])
  })

  it('a fonte do destaque é a regra única', () => {
    expect(fonte('lib/agenda/minha-agenda.ts')).toContain("from '@/lib/agenda/em-andamento'")
  })
})

// ─── As quatro telas ────────────────────────────────────────────────────────

describe('as quatro telas mostram o Em andamento pela mesma leitura e pelo mesmo bloco', () => {
  it('o bloco filtra pela regra única, com o relógio andando, e some quando não há nada', () => {
    const bloco = fonte('components/shared/em-andamento-agora.tsx')
    expect(bloco).toContain("'use client'")
    expect(bloco).toContain('osEmAndamento(')
    expect(bloco).toContain('useAgora(')
    expect(bloco).toContain('data-em-andamento')
    expect(bloco).toMatch(/if \(!?\w+\.length( === 0)?\) return null|if \(\w+\.length === 0\) return null/)
    expect(fonte('lib/agenda/em-andamento-da-equipe.ts')).toContain("from '@/lib/agenda/em-andamento'")
  })

  it('o painel da unidade: no topo da "Agenda de hoje", com a vista pessoal', () => {
    const p = fonte('app/[slug]/dashboard/page.tsx')
    expect(p).toContain('lerEmAndamento(')
    expect(p).toContain('<EmAndamentoAgora')
    expect(p.indexOf('<EmAndamentoAgora'), 'dentro do cartão da Agenda de hoje, antes da lista').toBeGreaterThan(p.indexOf('>Agenda de hoje<'))
    expect(p.indexOf('<EmAndamentoAgora')).toBeLessThan(p.indexOf('agendaDeHoje.length === 0'))
    expect(p).toMatch(/lerEmAndamento\(\{[^}]*profissional: proId/)
  })

  it('o painel da rede: a quem tem a Agenda, com a unidade em cada linha', () => {
    const p = fonte('app/admin/dashboard/page.tsx')
    expect(p).toContain('lerEmAndamento(')
    expect(p).toMatch(/canAgenda \? await lerEmAndamento\(/)
    expect(p).toMatch(/<EmAndamentoAgora[^>]*mostrarUnidade=\{branches\.length > 1\}/)
  })

  it('a Agenda da unidade e a da rede: uma faixa acima da grade, no dia e na semana', () => {
    const unidade = fonte('app/[slug]/agenda/page.tsx')
    const rede = fonte('app/admin/agenda/page.tsx')
    for (const p of [unidade, rede]) {
      expect(p).toContain('lerEmAndamento(')
      expect(p).toContain('emAndamento={')
    }
    expect(rede).toMatch(/profissional: agendaOwner/)
    const calendario = fonte('components/branch/agenda-calendar.tsx')
    expect(calendario).toMatch(/\(view === 'dia' \|\| view === 'semana'\) && emAndamento/)
    expect(calendario.indexOf("(view === 'dia' || view === 'semana') && emAndamento")).toBeLessThan(calendario.indexOf('<AgendaDayView'))
    const daRede = fonte('components/admin/admin-agenda-view.tsx')
    expect(daRede).toMatch(/\(view === 'day' \|\| view === 'week'\) && emAndamento/)
    expect(daRede.indexOf("(view === 'day' || view === 'week') && emAndamento")).toBeLessThan(daRede.indexOf('<DayGrid'))
  })

  it('a Minha agenda: no destaque, sem um segundo bloco', () => {
    const m = fonte('components/branch/professional-agenda.tsx')
    expect(m).toContain('tambemEmAndamento')
    expect(m).toContain('heroEvent.ate')
    expect(m).not.toContain('<EmAndamentoAgora')
  })
})
