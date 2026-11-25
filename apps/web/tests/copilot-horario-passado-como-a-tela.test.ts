import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { recusaDoHorarioPassado } from '@/lib/appointments/horario-passado'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O horário que já passou, no Copilot, é o da tela (o Heitor, 25/11, sobre o
 * Agendar: "recusa, não dá pra agendar no passado"; sobre o remarcar:
 * "remarcar para o passado é possível desde que não tenha passado do horario
 * já, o que tornaria impossível desse atendimento acontecer"). A regra é uma
 * só, `recusaDoHorarioPassado` (`lib/appointments/horario-passado.ts`), que os
 * núcleos já conferem: recusa o que é antes do minuto de agora, no relógio da
 * unidade, e diz a partir de quando se pode.
 *
 * O Copilot tinha a dele: 5 minutos de tolerância (agendava 09:57 às 10:00,
 * e o núcleo recusava no Confirmar) e "Esse horário já passou." sem dizer
 * quando pode. E recusava trocar só quem atende de um agendamento cujo
 * horário já passou — o que o `remarcarCore` aceita (o horário não muda).
 */

const FUSO = 'America/Sao_Paulo'
// 10:00:30 em São Paulo.
const AGORA = new Date('2026-11-25T13:00:30Z')
const UNIDADE = { id: 'b-centro', name: 'Centro', slug: 'centro' }
const AG = '11111111-1111-4111-8111-111111111111'

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@estetica-os/nucleo/lib/planos/da-rede', async orig => ({
  ...(await orig<typeof import('@estetica-os/nucleo/lib/planos/da-rede')>()),
  redeTemRecurso: async () => false,
}))
vi.mock('@/lib/agenda/bloqueios', () => ({ bloqueiosQueBatem: async () => [] }))
vi.mock('@/lib/appointments/core', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/core')>()),
  horarioOcupado: async () => false,
  // Passou da conferência do horário: o resto do preparo não interessa aqui.
  conferirPecasDoAgendamento: async () => 'PASSOU DO HORARIO',
}))
vi.mock('@/lib/appointments/alteracoes', async orig => ({
  ...(await orig<typeof import('@/lib/appointments/alteracoes')>()),
  // Marcado para hoje às 09:00 (já passou), com a Bia.
  agendamentoAoAlcance: async () => ({ id: AG, status: 'SCHEDULED', branch_id: UNIDADE.id, professional_id: 'p-bia', scheduled_at: '2026-11-25T12:00:00Z', duration_min: 60 }),
}))
vi.mock('@/lib/copilot/ferramentas/comum', async orig => ({
  ...(await orig<typeof import('@/lib/copilot/ferramentas/comum')>()),
  resolverUnidade: async () => ({ unidade: UNIDADE }),
  resolverProcedimento: async () => ({ id: 'proc-1', name: 'Limpeza', duration_min: 60 }),
  resolverProfissional: async (_c: unknown, nome: string) => (/t[aâ]nia/i.test(nome) ? { id: 'p-tania', name: 'Tânia' } : { id: 'p-bia', name: 'Bia' }),
  resolverCliente: async () => ({ id: 'cl-1', name: 'Neusa' }),
  nomesPorId: async (_c: unknown, _t: string, ids: string[]) => new Map(ids.map(id => [id, id === 'p-bia' ? 'Bia' : 'Nome'])),
  fusoDe: async () => FUSO,
}))

function admin() {
  const from = () => {
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'in', 'is', 'order', 'limit']) b[op] = () => b
    b.single = () => b
    b.maybeSingle = () => b
    b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: { client_id: 'cl-1', procedure_id: 'proc-1', auth_id: null }, error: null }).then(ok)
    return b
  }
  return { from }
}
const contexto = () => ({
  ctx: { tenantId: 't1', branchId: UNIDADE.id, unidades: [UNIDADE.id], internalUserId: 'u1', userName: 'Bia', permissions: { agenda: 'MANAGE' } },
  admin: admin(), pagina: '/centro/agenda', slugDoPortal: 'centro',
}) as never

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AGORA) })
afterEach(() => { vi.useRealTimers() })

describe('agendar: o horário que já passou é o da tela', () => {
  it('sem os 5 minutos de tolerância, e com a mensagem da regra', async () => {
    const { agendar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = await agendar.preparar(contexto(), { cliente: 'Neusa', procedimento: 'Limpeza', profissional: 'Bia', data: '2026-11-25', hora: '09:57' })
    expect(r).toEqual({ erro: recusaDoHorarioPassado('2026-11-25T12:57:00.000Z', AGORA, FUSO) })
    expect((r as { erro: string }).erro).toContain('Escolha a partir de')
  })
  it('o minuto de agora vale (a cliente que chegou sem horário)', async () => {
    const { agendar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = await agendar.preparar(contexto(), { cliente: 'Neusa', procedimento: 'Limpeza', profissional: 'Bia', data: '2026-11-25', hora: '10:00' })
    expect(r).toEqual({ erro: 'PASSOU DO HORARIO' })
  })
})

describe('remarcar: o horário NOVO que já passou é o da tela', () => {
  it('para um horário que já passou, recusa com a mensagem da regra', async () => {
    const { remarcar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = await remarcar.preparar(contexto(), { agendamento: AG, data: '2026-11-25', hora: '09:58' })
    expect(r).toEqual({ erro: recusaDoHorarioPassado('2026-11-25T12:58:00.000Z', AGORA, FUSO) })
  })
  it('trocar só quem atende não é horário novo: vale mesmo com o horário marcado já passado', async () => {
    const { remarcar } = await import('@/lib/copilot/ferramentas/agenda-escrita')
    const r = await remarcar.preparar(contexto(), { agendamento: AG, data: '2026-11-25', hora: '09:00', profissional: 'Tânia' }) as { erro?: string; resumo?: { titulo: string } }
    expect(r.erro).toBeUndefined()
    expect(r.resumo?.titulo).toBe('Trocar quem atende')
  })
})
