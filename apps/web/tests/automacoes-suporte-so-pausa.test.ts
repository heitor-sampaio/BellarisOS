import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O suporte só PAUSA automação (auditoria das regras, 2026-11-18; D18 do
 * levantamento, o Heitor, 2026-11-11: "não liga nem muda os limites";
 * CLAUDE.md §14: nada que vá à paciente sai do suporte — `bloqueioDoSuporte`).
 * Até aqui o suporte editava o texto de uma automação LIGADA, e a paciente
 * recebia o texto escrito por ele. Na sessão de suporte: pausar, sim; criar,
 * editar, ligar e excluir, não.
 */

let statusGravado = 'ATIVA'
const atualizou: unknown[] = []

function construtor(tabela: string) {
  const b: Record<string, unknown> = {}
  let unico = false
  for (const op of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'delete']) {
    b[op] = () => b
  }
  b.update = (patch: unknown) => { atualizou.push({ tabela, patch }); return b }
  b.maybeSingle = () => { unico = true; return b }
  b.single = () => { unico = true; return b }
  b.then = (ok: (r: unknown) => unknown) => Promise.resolve({
    data: unico ? { id: 'a1', tenant_id: 't1', status: statusGravado, versao: 1, limites: null, grafo: { nos: [], ligacoes: [] } } : [],
    error: null,
  }).then(ok)
  return b
}

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor, rpc: async () => ({ data: null, error: null }) }) }))
vi.mock('@/lib/auth', () => ({
  getTenantContext: async () => ({
    tenantId: 't1', branchId: null, internalUserId: 'u1', isNetworkAdmin: true,
    suporte: { sessaoId: 's1', atendente: 'Atendente' }, permissions: { automations: 'MANAGE' },
  }),
  assertPermission: () => {},
}))

beforeEach(() => { statusGravado = 'ATIVA'; atualizou.length = 0 })

const GRAFO = { nos: [], ligacoes: [] }

describe('a sessão de suporte e as automações', () => {
  it('não edita a automação ligada (nem com os mesmos limites)', async () => {
    const { salvarAutomacao } = await import('@/actions/automacoes')
    const r = await salvarAutomacao({ id: 'a1', nome: 'Lembrete', grafo: GRAFO as never })
    expect(r.error).toMatch(/modo suporte/)
    expect(atualizou).toEqual([])
  })

  it('não edita nem a pausada: o suporte só pausa', async () => {
    statusGravado = 'PAUSADA'
    const { salvarAutomacao } = await import('@/actions/automacoes')
    const r = await salvarAutomacao({ id: 'a1', nome: 'Lembrete', grafo: GRAFO as never })
    expect(r.error).toMatch(/modo suporte/)
  })

  it('não cria nem exclui', async () => {
    statusGravado = 'PAUSADA'
    const { criarAutomacao, criarAutomacaoDeModelo, excluirAutomacao } = await import('@/actions/automacoes')
    expect((await criarAutomacao('Nova')).error).toMatch(/modo suporte/)
    expect((await criarAutomacaoDeModelo('aniversario')).error).toMatch(/modo suporte/)
    expect((await excluirAutomacao('a1')).error).toMatch(/modo suporte/)
  })

  it('não liga', async () => {
    statusGravado = 'PAUSADA'
    const { mudarStatusDaAutomacao } = await import('@/actions/automacoes')
    expect((await mudarStatusDaAutomacao('a1', 'ATIVA')).error).toMatch(/modo suporte/)
  })

  it('pausa', async () => {
    const { mudarStatusDaAutomacao } = await import('@/actions/automacoes')
    expect((await mudarStatusDaAutomacao('a1', 'PAUSADA')).error).toBeUndefined()
    expect(atualizou).toHaveLength(1)
  })
})
