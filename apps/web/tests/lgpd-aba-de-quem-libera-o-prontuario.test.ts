import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Quem tem o Prontuário em Gerenciar libera a parte clínica do pedido da LGPD
 * (LG-06 do catálogo de Clientes) — e é ela que o aviso do pedido chama, com a
 * aba aberta para ela (LG-08). Sem Clientes em Ver, a aba escondia TODOS os
 * pedidos ("o cargo precisa de Clientes (Ver)"), e o pedido com o prontuário
 * não andava (D2 da 39ª: a rede deu Clientes ao cargo para destravar).
 *
 * Para ela, a aba mostra os pedidos com o prontuário à espera de liberação, e
 * só esses; o resto da lista continua pedindo Clientes em Ver (Q08, revisão de
 * 24/11).
 */

const WEB = join(__dirname, '..')
let permissoes: Record<string, string> = {}
const filtros: [string, unknown][] = []

function construtor() {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'order', 'neq', 'in', 'limit']) b[op] = () => b
  b.eq = (col: string, val: unknown) => { filtros.push([col, val]); return b }
  b.range = () => Promise.resolve({ data: [], error: null })
  return b
}

vi.mock('next/server', () => ({ after: (fn: () => unknown) => { void fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/auth', () => {
  const nivel = (n?: string) => n === 'MANAGE' ? 2 : n === 'VIEW' ? 1 : 0
  const can = (ctx: { permissions: Record<string, string> }, m: string, r: 'VIEW' | 'MANAGE' = 'VIEW') => nivel(ctx.permissions[m]) >= nivel(r)
  return {
    getTenantContext: async () => ({ tenantId: 't1', branchId: null, internalUserId: 'u1', permissions: permissoes, suporte: null }),
    can,
    assertPermission: (ctx: { permissions: Record<string, string> }, m: string, r: 'VIEW' | 'MANAGE') => {
      if (!can(ctx, m, r)) throw new Error('sem acesso')
    },
    assertClient: () => {},
  }
})
vi.mock('@/lib/suporte/travas', () => ({ bloqueioDoSuporte: () => null }))
vi.mock('@/lib/lgpd/export', () => ({ LGPD_BUCKET: 'lgpd-exports' }))
vi.mock('@/lib/lgpd/processar', () => ({ processExportRequest: async () => {} }))
vi.mock('@/lib/lgpd/aviso-do-pedido', () => ({ avisarPedidoDaCliente: async () => {} }))
vi.mock('@/lib/prontuario/acessos', () => ({ registrarAcessoAoProntuario: async () => {} }))

beforeEach(() => { filtros.length = 0; permissoes = {} })

describe('a aba LGPD de quem libera o prontuário', () => {
  it('o que a aba mostra: tudo com Clientes em Ver; só os prontuários a liberar com o Prontuário em Gerenciar; nada sem os dois', async () => {
    const { pedidosDaAbaLgpd } = await import('@/lib/lgpd/pedidos-da-aba')
    const com = (p: Record<string, string>) => (m: string, n: 'VIEW' | 'MANAGE') =>
      (p[m] === 'MANAGE') || (p[m] === 'VIEW' && n === 'VIEW')
    expect(pedidosDaAbaLgpd(com({ clients: 'VIEW' }))).toBe('todos')
    expect(pedidosDaAbaLgpd(com({ clients: 'MANAGE', medical_records: 'MANAGE' }))).toBe('todos')
    expect(pedidosDaAbaLgpd(com({ medical_records: 'MANAGE' }))).toBe('prontuario')
    expect(pedidosDaAbaLgpd(com({ medical_records: 'VIEW' }))).toBe('nenhum')
    expect(pedidosDaAbaLgpd(com({ settings: 'MANAGE' }))).toBe('nenhum')
  })

  it('com o Prontuário em Gerenciar e sem Clientes, a lista traz os pedidos com o prontuário à espera — e só eles', async () => {
    permissoes = { medical_records: 'MANAGE' }
    const { listDataRequests } = await import('@/actions/lgpd')
    await expect(listDataRequests()).resolves.toEqual([])
    expect(filtros).toContainEqual(['tenant_id', 't1'])
    expect(filtros).toContainEqual(['include_medical', true])
    expect(filtros).toContainEqual(['medical_status', 'pending'])
  })

  it('com Clientes em Ver, a lista é a de sempre (todos os pedidos da rede)', async () => {
    permissoes = { clients: 'VIEW' }
    const { listDataRequests } = await import('@/actions/lgpd')
    await listDataRequests()
    expect(filtros).toEqual([['tenant_id', 't1']])
  })

  it('sem Clientes e sem o Prontuário em Gerenciar, a lista é recusada', async () => {
    permissoes = { medical_records: 'VIEW' }
    const { listDataRequests } = await import('@/actions/lgpd')
    await expect(listDataRequests()).rejects.toThrow()
  })

  it('a tela não esconde os pedidos de quem libera o prontuário: o portão é o de pedidosDaAbaLgpd', () => {
    const tela = readFileSync(join(WEB, 'app/_shared/configuracoes.tsx'), 'utf8')
    expect(tela).toMatch(/pedidosDaAbaLgpd\(/)
    expect(tela).not.toMatch(/lgpdSemClientes\s*=\s*conteudo === 'lgpd' && !can\(ctx, 'clients', 'VIEW'\)/)
  })
})
