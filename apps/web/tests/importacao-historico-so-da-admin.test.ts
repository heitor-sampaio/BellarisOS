import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O histórico das Importações é só da Admin da rede (revisão de 24/11, Q10 do
 * catálogo de Clientes: "As Importações estão na configuração da rede toda
 * (CLAUDE.md §11): a tela inteira, o histórico e o relatório, é só da Admin da
 * rede."). Ler as "Importações anteriores", acompanhar, retomar e baixar o
 * relatório (que traz dado pessoal) pediam só o módulo do destino.
 */

let consultou = false
let ctx: Record<string, unknown> = {}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      consultou = true
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'in', 'order', 'limit']) b[op] = () => b
      b.maybeSingle = () => Promise.resolve({ data: { destino: 'clientes', branch_id: null, nome_arquivo: 'a.csv', erros: [], avisos: [], erros_expiram_em: null }, error: null })
      b.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
      return b
    },
  }),
}))
vi.mock('@/lib/auth', () => ({
  can: (c: { permissions: Record<string, string> }, m: string, n: string) => c.permissions[m] === 'MANAGE' || (n === 'VIEW' && c.permissions[m] === 'VIEW'),
  getTenantContext: async () => ctx,
}))

const COM_CLIENTES = { tenantId: 't1', isClient: false, isNetworkAdmin: false, permissions: { clients: 'MANAGE', crm: 'MANAGE' } }
const ADMIN = { ...COM_CLIENTES, isNetworkAdmin: true }

beforeEach(() => { consultou = false })

describe('o histórico das Importações é só da Admin da rede', () => {
  it('as "Importações anteriores" não aparecem a quem tem Clientes e o CRM em Gerenciar sem ser a Admin', async () => {
    const { importacoesAnteriores } = await import('@/lib/importacao/historico')
    expect(await importacoesAnteriores(COM_CLIENTES as never)).toEqual([])
    expect(consultou, 'nem lê o banco').toBe(false)
    await importacoesAnteriores(ADMIN as never)
    expect(consultou, 'a Admin da rede lê').toBe(true)
  })

  it('o relatório (CSV) recusa quem não é a Admin da rede', async () => {
    const { GET } = await import('@/app/api/importacoes/[id]/erros/route')
    const id = '11111111-1111-4111-8111-111111111111'
    ctx = COM_CLIENTES
    const r = await GET(new Request('https://x/api') as never, { params: Promise.resolve({ id }) })
    expect(r.status).toBe(403)
    ctx = ADMIN
    const ok = await GET(new Request('https://x/api') as never, { params: Promise.resolve({ id }) })
    expect(ok.status).toBe(200)
  })

  it('acompanhar e retomar passam pela mesma régua (importacaoAoAlcance confere a Admin da rede)', () => {
    const t = readFileSync(join(__dirname, '..', 'actions', 'importacao.ts'), 'utf8')
    const ini = t.indexOf('async function importacaoAoAlcance(')
    const corpo = t.slice(ini, t.indexOf('\n}\n', ini))
    expect(corpo).toMatch(/mexeNaConfigDaRede\(ctx\)/)
  })
})
