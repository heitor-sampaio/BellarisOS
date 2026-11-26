import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext } from '@estetica-os/types'

// O primeiro import() de actions/appointments carrega o núcleo e o Supabase.
vi.setConfig({ testTimeout: 60_000 })

/**
 * R13 e R14 (o Heitor, 26/11, na página de perguntas): "Só mostra os horarios,
 * salas e pessoas que estão livres" e "Horarios, salas e pessoas não disponíveis
 * não devem aparecer nas listas". Era "(ocupada)" desligada na lista.
 *
 * A leitura (decisão do Claude, 26/11): "não disponível" é o que o sistema
 * RECUSARIA naquele horário — o choque com outro atendimento, o bloqueio (da
 * pessoa ou da sala), a sala ocupada, o horário que já passou. O encaixe (fora do
 * horário da pessoa, a unidade fechada) é permitido e continua aparecendo, com o
 * aviso. A pessoa ou a sala JÁ escolhida que fica indisponível porque o horário
 * mudou continua como o valor do campo, e a janela diz "Não vai ser agendado".
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

// ─── O Supabase falso: cada consulta responde pelo que a tabela e os filtros pedem ───
type Filtros = Record<string, unknown>
let responder: (tabela: string, filtros: Filtros) => unknown = () => null
function consulta(tabela: string) {
  const filtros: Filtros = {}
  const cadeia: Record<string, unknown> = {}
  const devolve = () => cadeia
  for (const m of ['select', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'in', 'order', 'range', 'limit', 'is', 'contains', 'filter'])
    cadeia[m] = devolve
  cadeia.eq = (col: string, v: unknown) => { filtros[col] = v; return cadeia }
  cadeia.maybeSingle = devolve
  cadeia.single = devolve
  cadeia.then = (ok: (r: { data: unknown; error: null }) => unknown) => ok({ data: responder(tabela, filtros), error: null })
  return cadeia
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => consulta(t) }) }))

// Quem tem choque (um atendimento no banco falso, lido pela régua de sempre,
// conflitosDoHorario) e quem tem bloqueio (bloqueiosQueBatem) no horário.
const comChoque = new Set<string>()
const comBloqueio = new Set<string>()
vi.mock('@/lib/appointments/core', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/core')>()),
  conferirPecasDoAgendamento: async () => null,
  computeAvailableSlots: async (_a: unknown, _b: string, _p: string, data: string) => (data === '2026-12-11' ? ['10:00', '11:00', '12:00'] : []),
}))
vi.mock('@/lib/agenda/bloqueios', async orig => ({
  ...(await orig<typeof import('@/lib/agenda/bloqueios')>()),
  bloqueiosQueBatem: async (_a: unknown, o: { professionalId?: string | null; roomId?: string | null; inicio: Date; fim: Date }) =>
    comBloqueio.has((o.professionalId ?? o.roomId) as string)
      ? [{ id: 'x', inicio: o.inicio.toISOString(), fim: o.fim.toISOString(), motivo: 'Almoço', professionalId: o.professionalId ?? null, roomId: o.roomId ?? null }] : [],
  bloqueiosDoPeriodo: async (_t: string, o: { salas?: string[] }) =>
    (o.salas ?? []).filter(s => comBloqueio.has(s)).map(s => ({
      id: 'y', inicio: '2026-12-11T13:00:00.000Z', fim: '2026-12-11T14:00:00.000Z', motivo: 'Manutenção', professionalId: null, roomId: s,
    })),
}))
vi.mock('@/lib/cached-queries', async orig => ({
  ...(await orig<typeof import('@/lib/cached-queries')>()),
  getCachedBranchProfessionals: async (unidade: string) => unidade === 'b1'
    ? [{ id: 'atual', name: 'Bruna' }, { id: 'livre', name: 'Lia' }, { id: 'ocupada', name: 'Rita' }, { id: 'bloqueada', name: 'Gabi' }]
    : [{ id: 'livre2', name: 'Talita' }, { id: 'bloqueada2', name: 'Débora' }],
  getCachedNetworkBranches: async () => [{ id: 'b1', name: 'Moinhos' }, { id: 'b2', name: 'Menino Deus' }],
  getCachedRoomsByBranch: async () => [{ id: '00000000-0000-4000-8000-0000000000a1', name: 'Sala Rosa' }, { id: '00000000-0000-4000-8000-0000000000a2', name: 'Sala Azul' }],
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
  lerFusoDaUnidade: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/auth', async orig => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getTenantContext: async () => ({ tenantId: 't1', branchId: null, unidades: null, isNetworkAdmin: true } as unknown as TenantContext),
  assertPermission: () => {},
  alcancaUnidade: () => true,
}))

const AGENDAMENTO = {
  id: '00000000-0000-4000-8000-000000000001', status: 'SCHEDULED', branch_id: 'b1', professional_id: 'atual',
  procedure_id: null, scheduled_at: '2026-12-11T13:00:00.000Z', duration_min: 60,
}

beforeEach(() => {
  comChoque.clear(); comBloqueio.clear()
  responder = (tabela, filtros) => {
    if (tabela === 'appointments' && filtros.id) return AGENDAMENTO
    // O choque: outro atendimento da pessoa às 13:00 UTC, o mesmo horário do agendamento.
    if (tabela === 'appointments' && filtros.professional_id) return comChoque.has(filtros.professional_id as string)
      ? [{ scheduled_at: '2026-12-11T13:00:00.000Z', duration_min: 60, status: 'SCHEDULED', completed_at: null, branch_id: 'b1', branches: { name: 'Moinhos' } }] : []
    if (tabela === 'rooms') return filtros.id ? { id: filtros.id, name: 'Sala Rosa' } : [{ id: '00000000-0000-4000-8000-0000000000a1', name: 'Sala Rosa' }, { id: '00000000-0000-4000-8000-0000000000a2', name: 'Sala Azul' }]
    if (tabela === 'branches') return { id: 'b1', horario: null, fuso: 'America/Sao_Paulo' }
    if (tabela === 'procedure_rooms') return []
    if (tabela === 'appointments' && filtros.room_id) return [{ scheduled_at: '2026-12-11T14:00:00.000Z', duration_min: 60, status: 'SCHEDULED', completed_at: null, branch_id: 'b1', clients: { name: 'Ana' } }]
    if (tabela === 'appointments') return []
    if (tabela === 'users') return { horario: null }
    return null
  }
})

describe('a pura: só o que está livre, e a escolhida fica', () => {
  it('tira a indisponível e mantém a que já está escolhida', async () => {
    const { soOQueEstaLivre } = await import('@/lib/agenda/so-o-que-esta-livre')
    const opcoes = [{ id: 'a', livre: true }, { id: 'b', livre: false }, { id: 'c', livre: false }]
    expect(soOQueEstaLivre(opcoes).map(o => o.id)).toEqual(['a'])
    expect(soOQueEstaLivre(opcoes, 'c').map(o => o.id)).toEqual(['a', 'c'])
    expect(soOQueEstaLivre(opcoes, '').map(o => o.id)).toEqual(['a'])
  })
  it('o motivo do Confirmar desligado com a sala escolhida ocupada', async () => {
    const { motivoDoConfirmarDesligado } = await import('@/lib/agenda/motivo-do-confirmar')
    expect(motivoDoConfirmarDesligado({ salaOcupada: true })).toBe('Escolha outra sala ou outro horário: esta sala está ocupada.')
  })
})

describe('R13: o "Trocar profissional" só oferece quem está livre (sem choque e sem bloqueio)', () => {
  it('a ocupada e a bloqueada não vêm', async () => {
    comChoque.add('ocupada'); comBloqueio.add('bloqueada')
    const { profissionaisParaTrocar } = await import('@/actions/appointments')
    const r = await profissionaisParaTrocar(AGENDAMENTO.id)
    expect(r.livres.map(p => p.name)).toEqual(['Lia'])
    expect(r.atendem, 'quantas atendem na unidade (fora a de agora), para a lista vazia dizer por quê').toBe(3)
  })
  it('a tela não mostra "(ocupada)" e diz por que a lista está vazia', () => {
    const tela = fonte('components/branch/janela-do-agendamento-acoes.tsx')
    expect(tela).not.toContain('(ocupada)')
    expect(tela).not.toMatch(/disabled=\{!(o|p|s)\.livre\}/)
    expect(tela).toContain('NINGUEM_LIVRE_NO_HORARIO')
  })
})

describe('R13: o "Mudar de unidade" só oferece quem e a sala livres no horário', () => {
  it('a pessoa bloqueada e a sala bloqueada não vêm', async () => {
    comBloqueio.add('bloqueada2'); comBloqueio.add('00000000-0000-4000-8000-0000000000a2')
    const { opcoesParaMudarDeUnidade } = await import('@/actions/appointments')
    const [menino] = await opcoesParaMudarDeUnidade(AGENDAMENTO.id)
    expect(menino!.profissionais.map(p => p.name)).toEqual(['Talita'])
    expect(menino!.salas.map(s => s.name)).toEqual(['Sala Rosa'])
    expect(menino!.quemAtende).toBe(2)
    expect(menino!.salasQueServem).toBe(2)
  })
})

describe('R13: as salas do Agendar dizem a bloqueada como indisponível', () => {
  it('salasParaOHorario: a bloqueada não está livre (e não é a sugerida)', async () => {
    comBloqueio.add('00000000-0000-4000-8000-0000000000a1')
    const { salasParaOHorario } = await import('@/lib/appointments/salas')
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const r = await salasParaOHorario(createAdminClient(), {
      tenantId: 't1', branchId: 'b1', procedureId: null, inicio: new Date('2026-12-11T13:00:00Z'), duracaoMin: 60,
    })
    expect(r.salas).toEqual([
      { id: '00000000-0000-4000-8000-0000000000a1', name: 'Sala Rosa', livre: false, indisponivel: 'bloqueada' },
      { id: '00000000-0000-4000-8000-0000000000a2', name: 'Sala Azul', livre: true },
    ])
  })
  it('o modal mostra só as livres (e a já escolhida), e quem atende pelo horário escolhido', () => {
    const modal = fonte('components/branch/appointment-modal.tsx')
    expect(modal).toMatch(/soOQueEstaLivre\(salasOferecidas/)
    expect(modal).toMatch(/soOQueEstaLivre\(profissionaisNoHorario/)
    expect(modal).toContain('quemNaoEstaLivreNoHorario(')
    expect(modal).toContain('NINGUEM_LIVRE_NO_HORARIO')
  })
  it('a sessão do pacote/plano não lista a sala indisponível', () => {
    const tela = fonte('components/branch/treatment-sessions-modal.tsx')
    expect(tela).not.toContain('(ocupada)')
    expect(tela).not.toMatch(/disabled=\{!x\.livre\}/)
  })
})

describe('R14: o "Usar o próximo livre" é livre da pessoa E da sala, e vale também no bloqueio', () => {
  it('com a sala, pula o horário em que ela está ocupada ou bloqueada', async () => {
    vi.useFakeTimers({ now: new Date('2026-12-10T12:00:00-03:00'), toFake: ['Date'] })
    try {
      comBloqueio.add('00000000-0000-4000-8000-0000000000a1')
      const { proximoHorarioLivre } = await import('@/actions/appointments')
      // 10:00 (13:00 UTC) é o bloqueio da sala; 11:00 (14:00 UTC) é o atendimento na sala.
      expect(await proximoHorarioLivre('b1', 'u1', 60)).toBe('2026-12-11T10:00')
      expect(await proximoHorarioLivre('b1', 'u1', 60, null, '00000000-0000-4000-8000-0000000000a1')).toBe('2026-12-11T12:00')
    } finally {
      vi.useRealTimers()
    }
  })
  it('o modal oferece o próximo livre também no bloqueio e passa a sala', () => {
    const modal = fonte('components/branch/appointment-modal.tsx')
    expect(modal).toMatch(/const chaveDoProximo = \(conflitoDoAviso \|\| bloqueioDoAviso \|\| salaOcupada\)/)
    expect(modal).toMatch(/proximoHorarioLivre\(unidadeId, profId, duracaoMin, scheduledAtUTC, salaId \|\| null\)/)
    expect(modal).toContain('data-proximo-livre-do-bloqueio')
  })
})

describe('R14: a grade de horários não mostra o horário ocupado nem o bloqueado', () => {
  it('a grade tira o ocupado em vez de desligá-lo, e diz quando não sobra nenhum', () => {
    const grade = fonte('components/shared/grade-de-horarios.tsx')
    expect(grade).not.toContain('disabled={!!booked}')
    expect(grade).toContain('Nenhum horário livre')
  })
  it('com a sala escolhida, a grade do dia conta os atendimentos DA SALA', async () => {
    const { getSchedulingDaySlots } = await import('@/actions/appointments')
    const r = await getSchedulingDaySlots('b1', 'u1', '2026-12-11', '00000000-0000-4000-8000-0000000000a1')
    expect(r.slots.map(s => s.scheduledAt)).toContain('2026-12-11T14:00:00.000Z')
  })
})
