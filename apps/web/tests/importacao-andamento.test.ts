import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TenantContext } from '@estetica-os/types'

/**
 * O andamento da importação não derruba a importação (F26, 2026-11-05).
 *
 * Na 3ª completa o banco engasgou um instante e UMA gravação do andamento
 * ("4 de 4 linhas") estourou o tempo limite: a importação inteira virou
 * "Falhou — Gravar o andamento da importação: canceling statement due to
 * statement timeout", com as quatro linhas já gravadas. A gravação do
 * andamento é idempotente (o placar inteiro, da própria passagem): tenta de
 * novo antes de desistir.
 */

type Resultado = { data: unknown; error: { message: string } | null }
interface Pedido { tabela: string; ops: { op: string; args: unknown[] }[] }

const pedidos: Pedido[] = []
let responder: (p: Pedido) => Resultado = () => ({ data: null, error: null })

function construtor(tabela: string) {
  const p: Pedido = { tabela, ops: [] }
  pedidos.push(p)
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'update', 'insert', 'delete', 'eq', 'neq', 'in', 'lt', 'order', 'limit', 'maybeSingle', 'single']) {
    b[op] = (...args: unknown[]) => { p.ops.push({ op, args }); return b }
  }
  b.then = (ok: (r: Resultado) => unknown, falhou?: (e: unknown) => unknown) => {
    try { return Promise.resolve(responder(p)).then(ok, falhou) } catch (e) { return Promise.reject(e).then(ok, falhou) }
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor, rpc: () => construtor('rpc') }) }))
vi.mock('@/lib/importacao/referencias', () => ({ referenciasDaRede: async () => ({}) }))
vi.mock('@/lib/crm/oportunidade', () => ({ criarOportunidadeCore: vi.fn() }))
vi.mock('@/lib/contatos/propagar', () => ({ propagarDadosDaPessoa: vi.fn() }))

const PEDIDO = {
  id: 'imp', tenant_id: 't', branch_id: null, destino: 'contatos', mapeamento: [], oportunidade: null,
  processadas: 0, novas: 0, completadas: 0, sem_mudanca: 0, com_erro: 0, oportunidades: 0, erros: [], nao_completar: null,
}
const ctx = { tenantId: 't' } as TenantContext
const ehAndamento = (p: Pedido) => p.tabela === 'importacoes' && p.ops.some(o => o.op === 'eq' && o.args[0] === 'execucao')
const statusGravado = (p: Pedido) => (p.ops.find(o => o.op === 'update')?.args[0] as { status?: string }).status

beforeEach(() => { pedidos.length = 0; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('processarImportacao — o andamento', () => {
  it('uma gravação do andamento que estoura o tempo é tentada de novo, e a importação conclui', async () => {
    let falhasDoAndamento = 1
    responder = p => {
      if (p.tabela === 'importacoes' && p.ops.some(o => o.op === 'maybeSingle')) return { data: PEDIDO, error: null }
      if (p.tabela === 'importacao_linhas') return { data: [], error: null }
      if (ehAndamento(p)) {
        if (falhasDoAndamento-- > 0) return { data: null, error: { message: 'canceling statement due to statement timeout' } }
        return { data: [{ id: 'imp' }], error: null }
      }
      return { data: null, error: null }
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { processarImportacao } = await import('@/lib/importacao/processar')
    const fim = processarImportacao('imp', ctx)
    await vi.runAllTimersAsync()
    await fim
    const andamentos = pedidos.filter(ehAndamento).map(statusGravado)
    expect(andamentos).toEqual(['concluida', 'concluida'])
  })

  it('o banco que segue fora depois das novas tentativas marca a falha, retomável', async () => {
    responder = p => {
      if (p.tabela === 'importacoes' && p.ops.some(o => o.op === 'maybeSingle')) return { data: PEDIDO, error: null }
      if (p.tabela === 'importacao_linhas') return { data: [], error: null }
      if (ehAndamento(p) && statusGravado(p) === 'concluida') return { data: null, error: { message: 'canceling statement due to statement timeout' } }
      if (ehAndamento(p)) return { data: [{ id: 'imp' }], error: null }
      return { data: null, error: null }
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { processarImportacao } = await import('@/lib/importacao/processar')
    const fim = processarImportacao('imp', ctx)
    await vi.runAllTimersAsync()
    await fim
    const andamentos = pedidos.filter(ehAndamento).map(statusGravado)
    expect(andamentos.at(-1)).toBe('falhou')
    expect(andamentos.filter(s => s === 'concluida').length).toBeGreaterThan(1)
  })
})
