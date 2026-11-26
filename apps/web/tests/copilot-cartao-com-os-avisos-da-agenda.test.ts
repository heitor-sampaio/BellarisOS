import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O cartão do Copilot dá os avisos que a janela da agenda dá (o Copilot faz o
 * que a tela faz — `docs/regras/copilot.md`; AG-04; CX-13). Na 34ª simulação o
 * `agendar` gravou a Diva às 11:15 (fora da grade de 30 em 30 min) e a Wilma às
 * 22:30 com quem atende até 22:00 sem aviso nenhum, e a janela "+ Agendar" diz
 * os dois ("O encaixe é permitido").
 *
 * - O fora do horário de quem atende (e da unidade) é o de `avisosDoHorarioCore`
 *   (`lib/appointments/encaixe.ts`), a MESMA função das actions do modal
 *   (`avisosDoHorario`, `avisosDoRemarcar`) — no agendar e no remarcar.
 * - O fora da grade é o da janela "+ Agendar" (A17 da 10ª): a grade da unidade
 *   no dia (`gradeDoCheckout`), só quando não há o aviso do horário — como a
 *   janela. O remarcar da tela não o diz, e o Copilot também não.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-11-25T13:00:30Z')
const UNIDADE = { id: 'b-centro', name: 'Centro', slug: 'centro' }
const AG = '11111111-1111-4111-8111-111111111111'
// Quinta, 26/11: a unidade abre das 08:00 às 20:00.
const HORARIO = { dias: { 4: [{ de: '08:00', ate: '20:00' }] } }
const FORA = 'Fora do horário de atendimento de Raimundo (08:00–22:00). O encaixe é permitido.'

const avisos = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@estetica-os/nucleo/lib/planos/da-rede', async orig => ({
  ...(await orig<typeof import('@estetica-os/nucleo/lib/planos/da-rede')>()),
  redeTemRecurso: async () => false,
}))
vi.mock('@/lib/appointments/encaixe', () => ({ avisosDoHorarioCore: avisos }))
vi.mock('@/lib/appointments/core', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/core')>()),
  horarioOcupado: async () => false,
  conferirPecasDoAgendamento: async () => null,
  recusaDoBloqueioNoHorario: async () => null,
}))
vi.mock('@/lib/creditos/pago-no-app', () => ({ pagoParaAgendar: async () => null }))
vi.mock('@/lib/procedimentos/quem-realiza', async orig => ({
  ...(await orig<typeof import('@/lib/procedimentos/quem-realiza')>()),
  quemRealizaOProcedimento: async () => [],
}))
vi.mock('@/lib/appointments/alteracoes', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/alteracoes')>()),
  agendamentoAoAlcance: async () => ({ id: AG, status: 'SCHEDULED', branch_id: UNIDADE.id, professional_id: 'p-rai', scheduled_at: '2026-11-26T13:00:00Z', duration_min: 60, room_id: null }),
}))
vi.mock('@/lib/copilot/ferramentas/comum', async orig => ({
  ...(await orig<typeof import('@/lib/copilot/ferramentas/comum')>()),
  resolverUnidade: async () => ({ unidade: UNIDADE }),
  resolverProcedimento: async () => ({ id: 'proc-1', name: 'Limpeza', duration_min: 60, price: 160 }),
  resolverProfissional: async () => ({ id: 'p-rai', name: 'Raimundo' }),
  resolverCliente: async () => ({ id: 'cl-1', name: 'Wilma' }),
  nomesPorId: async (_c: unknown, _t: string, ids: string[]) => new Map(ids.map(id => [id, 'Nome'])),
  fusoDe: async () => FUSO,
}))

function admin() {
  const from = () => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'in', 'is', 'order', 'limit']) b[op] = () => b
    b.single = () => b
    b.maybeSingle = () => b
    b.then = (ok: (r: unknown) => unknown) => Promise.resolve({
      data: { client_id: 'cl-1', procedure_id: 'proc-1', auth_id: null, horario: HORARIO, fuso: FUSO }, error: null,
    }).then(ok)
    return b
  }
  return { from }
}
const contexto = () => ({
  ctx: { tenantId: 't1', branchId: UNIDADE.id, unidades: [UNIDADE.id], internalUserId: 'u1', userName: 'Graciete', permissions: { agenda: 'MANAGE' } },
  admin: admin(), pagina: '/centro/agenda', slugDoPortal: 'centro',
}) as never
const aviso = (r: unknown) => (r as { resumo?: { aviso?: string } }).resumo?.aviso ?? ''

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AGORA)
  avisos.mockReset()
  avisos.mockResolvedValue({ foraDoHorario: null, conflito: null, bloqueio: null })
})
afterEach(() => { vi.useRealTimers() })

const PEDIDO = { cliente: 'Wilma', procedimento: 'Limpeza', profissional: 'Raimundo', data: '2026-11-26' }

describe('agendar: o cartão leva os avisos da janela "+ Agendar"', () => {
  it('o fora do horário de quem atende, pela função do modal', async () => {
    avisos.mockResolvedValue({ foraDoHorario: FORA, conflito: null, bloqueio: null })
    const { agendar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = await agendar.preparar(contexto(), { ...PEDIDO, hora: '22:30' })
    expect(aviso(r)).toContain(FORA)
    expect(avisos).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      branchId: UNIDADE.id, professionalId: 'p-rai', scheduledAt: '2026-11-27T01:30:00.000Z', procedureId: 'proc-1',
    }))
  })

  it('o fora da grade de 30 em 30 minutos, com a frase da janela', async () => {
    const { agendar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = await agendar.preparar(contexto(), { ...PEDIDO, hora: '11:15' })
    expect(aviso(r)).toContain('11:15 fica fora da grade de 30 em 30 minutos: é um encaixe (permitido).')
  })

  it('na grade, nenhum aviso de grade; com o aviso do horário, só ele (como a janela)', async () => {
    const { agendar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    expect(aviso(await agendar.preparar(contexto(), { ...PEDIDO, hora: '11:00' }))).not.toMatch(/grade/)
    avisos.mockResolvedValue({ foraDoHorario: FORA, conflito: null, bloqueio: null })
    const fora = aviso(await agendar.preparar(contexto(), { ...PEDIDO, hora: '22:15' }))
    expect(fora).toContain(FORA)
    expect(fora).not.toMatch(/grade/)
  })
})

describe('remarcar: o cartão leva o aviso do horário da janela de remarcar', () => {
  it('o horário novo fora do horário de quem atende', async () => {
    avisos.mockResolvedValue({ foraDoHorario: FORA, conflito: null, bloqueio: null })
    const { remarcar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = await remarcar.preparar(contexto(), { agendamento: AG, data: '2026-11-26', hora: '22:30' })
    expect(aviso(r)).toContain(FORA)
    // O próprio agendamento não conta como choque (A25), como em avisosDoRemarcar.
    expect(avisos).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ excluir: AG, professionalId: 'p-rai' }))
  })
})

describe('a frase do fora da grade é a da janela', () => {
  it('o modal e o Copilot dizem o mesmo', () => {
    const raiz = join(__dirname, '..')
    const modal = readFileSync(join(raiz, 'components/branch/appointment-modal.tsx'), 'utf8')
    const copilot = readFileSync(join(raiz, 'lib/copilot/ferramentas/aviso-do-horario.ts'), 'utf8')
    const frase = 'fica fora da grade de 30 em 30 minutos: é um encaixe (permitido).'
    expect(modal).toContain(frase)
    expect(copilot).toContain(frase)
  })
})
