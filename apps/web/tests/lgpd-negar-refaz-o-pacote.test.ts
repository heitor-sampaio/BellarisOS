import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Negar o prontuário refaz o pacote, como liberar (D2 da 33ª; LG-05, LG-07 do
 * catálogo): o pacote pronto com o prontuário "em análise" diz que um pacote
 * novo vem quando a rede decidir — e, negado, ele não vinha. Depois da
 * decisão (liberar OU negar), o pedido volta a `pending` e o pacote é refeito
 * em segundo plano: o negado sai sem o prontuário, dizendo que não foi
 * liberado. Só o liberar registra o acesso ao prontuário (nada clínico sai no
 * negado).
 */

const atualizacoes: Record<string, unknown>[] = []
const processados: string[] = []
const acessos: string[] = []
let situacaoGravada = 'pending'

function construtor(tabela: string) {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'range']) b[op] = () => b
  b.update = (patch: Record<string, unknown>) => { atualizacoes.push({ tabela, ...patch }); return b }
  const linha = { id: 'p1', tenant_id: 't1', client_id: 'c1', medical_status: situacaoGravada }
  b.maybeSingle = () => Promise.resolve({ data: linha, error: null })
  b.single = b.maybeSingle
  b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok)
  return b
}

vi.mock('next/server', () => ({ after: (fn: () => unknown) => { void fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: construtor }) }))
vi.mock('@/lib/auth', () => ({
  getTenantContext: async () => ({ tenantId: 't1', branchId: null, internalUserId: 'u1', userName: 'Ademir', suporte: null }),
  assertPermission: () => {},
  assertClient: () => {},
  can: () => true,
}))
vi.mock('@/lib/suporte/travas', () => ({ bloqueioDoSuporte: () => null }))
vi.mock('@/lib/lgpd/export', () => ({ LGPD_BUCKET: 'lgpd-exports' }))
vi.mock('@/lib/lgpd/processar', () => ({ processExportRequest: async (id: string) => { processados.push(id) } }))
vi.mock('@/lib/lgpd/aviso-do-pedido', () => ({ avisarPedidoDaCliente: async () => {} }))
vi.mock('@/lib/prontuario/acessos', () => ({ registrarAcessoAoProntuario: async (_c: unknown, clientId: string) => { acessos.push(clientId) } }))

beforeEach(() => { atualizacoes.length = 0; processados.length = 0; acessos.length = 0; situacaoGravada = 'pending' })

function decisao(d: 'approved' | 'denied') {
  const f = new FormData()
  f.set('request_id', 'p1')
  f.set('decision', d)
  return f
}

describe('a decisão sobre o prontuário refaz o pacote', () => {
  it('negar reabre o pedido e refaz o pacote — sem o prontuário e sem registrar acesso', async () => {
    const { reviewMedicalData } = await import('@/actions/lgpd')
    const r = await reviewMedicalData(null, decisao('denied'))
    expect(r).toEqual({ success: true })
    const patch = atualizacoes.find(a => a.tabela === 'lgpd_requests')
    expect(patch, 'grava a decisão').toMatchObject({ medical_status: 'denied' })
    expect(patch, 'o pacote velho ("em análise") sai: o pedido volta a pendente').toMatchObject({
      status: 'pending', completed_at: null, export_json_path: null, export_pdf_path: null,
    })
    expect(processados, 'o pacote novo é montado em segundo plano').toEqual(['p1'])
    expect(acessos, 'nada clínico sai: não é acesso ao prontuário').toEqual([])
  })

  it('liberar segue igual: refaz o pacote e registra o acesso', async () => {
    const { reviewMedicalData } = await import('@/actions/lgpd')
    const r = await reviewMedicalData(null, decisao('approved'))
    expect(r).toEqual({ success: true })
    expect(atualizacoes.find(a => a.tabela === 'lgpd_requests')).toMatchObject({ medical_status: 'approved', status: 'pending' })
    expect(processados).toEqual(['p1'])
    expect(acessos).toEqual(['c1'])
  })

  it('o que já foi decidido não se decide de novo', async () => {
    situacaoGravada = 'denied'
    const { reviewMedicalData } = await import('@/actions/lgpd')
    const r = await reviewMedicalData(null, decisao('denied'))
    expect(r.error).toMatch(/já foi avaliada/)
    expect(processados).toEqual([])
  })
})
