import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A18 da 43ª (indicadores:CC-06, princípio 3): o "Ver mais 6 (9 no total)" do
 * "Reativar clientes" levava à lista de Clientes INTEIRA (12), sem o recorte —
 * a lista de Clientes não lê filtro nenhum da URL. O link diz quantas faltam e
 * o total; o que ele abre tem de ser essas.
 *
 * Decisão do Claude, 28/11: nada de filtro novo na lista de Clientes. O "Ver
 * mais" abre o resto do MESMO recorte no próprio quadro, em páginas, pela MESMA
 * conta (`getClientesParaReativarDoRecorte` → `metrics_clientes_para_reativar_rede`,
 * que ganha o deslocamento). A página seguinte é uma server action com a trava
 * do quadro (Clientes em Ver), a rede do contexto e a unidade da tela pelo
 * alcance (o contexto vence o pedido). As linhas novas têm o desenho das
 * primeiras (o "Cliente desde" da A14 incluso).
 */

const RAIZ = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')
const MIGRATIONS = join(RAIZ, '..', '..', 'supabase', 'migrations')

function ultimaQueMexeEm(funcao: string): { nome: string; sql: string } {
  const todas = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  for (let i = todas.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS, todas[i]!), 'utf8')
    if (sql.includes(`public.${funcao}(`)) return { nome: todas[i]!, sql }
  }
  throw new Error(`nenhuma migration mexe em ${funcao}`)
}

// ─── A action, com o contexto e a conta falsos ──────────────────────────────

interface CtxFalso {
  tenantId: string | null; isClient: boolean; branchId: string | null; unidades: string[] | null
  permissions: Record<string, 'NONE' | 'VIEW' | 'MANAGE'>
}
let ctx: CtxFalso
const U_A = '11111111-1111-4111-8111-111111111111'
const U_B = '22222222-2222-4222-8222-222222222222'
const U_DE_OUTRA_REDE = '99999999-9999-4999-8999-999999999999'
const UNIDADES_DA_REDE = [U_A, U_B]
const pedidosDaConta: Record<string, unknown>[] = []

vi.mock('@/lib/auth', () => ({
  getTenantContext: async () => ctx,
  can: (c: CtxFalso, m: string, nivel: 'VIEW' | 'MANAGE' = 'VIEW') =>
    nivel === 'VIEW' ? (c.permissions[m] ?? 'NONE') !== 'NONE' : c.permissions[m] === 'MANAGE',
  alcancaUnidade: (c: CtxFalso, id: string | null | undefined) => c.unidades === null || (!!id && c.unidades.includes(id)),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const filtros: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (col: string, v: unknown) => { filtros[col] = v; return b }
      b.maybeSingle = () => b
      b.then = (ok: (r: unknown) => unknown) => Promise.resolve({
        data: filtros.tenant_id === 'rede-1' && UNIDADES_DA_REDE.includes(String(filtros.id)) ? { id: filtros.id, name: `Unidade ${String(filtros.id)}` } : null,
        error: null,
      }).then(ok)
      return b
    },
  }),
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo', fusoDoRecorte: async () => 'America/Sao_Paulo', fusoDaRede: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/metrics/unidade', () => ({
  getClientesParaReativarDoRecorte: async (args: Record<string, unknown>) => {
    pedidosDaConta.push(args)
    return {
      total: 9, comVisita: 9, recentesSemVisita: 0,
      lista: [
        { id: 'c4', name: 'Dora', phone: null, ultimaVisita: null, unidade: null, unidadeSlug: null, antesDoSistema: false, clienteDesde: '2017-03-01' },
        { id: 'c5', name: 'Eva', phone: null, ultimaVisita: new Date(Date.now() - 120 * 86_400_000).toISOString(), unidade: 'Centro', unidadeSlug: 'centro', antesDoSistema: true, clienteDesde: null },
      ],
    }
  },
}))

const doAdmin = (): CtxFalso => ({ tenantId: 'rede-1', isClient: false, branchId: null, unidades: null, permissions: { clients: 'VIEW' } })

beforeEach(() => { pedidosDaConta.length = 0; ctx = doAdmin() })

async function acao() {
  const m = await import('@/actions/reativar-clientes') as Record<string, unknown>
  const f = m.maisClientesParaReativar as ((e: { deslocamento: number; unidade: string | null }) => Promise<
    { clientes: { id: string; name: string; diasSemVir: number | null; unidade?: string | null; antesDoSistema?: boolean; clienteDesde?: string | null }[]; total: number } | { error: string }
  >) | undefined
  expect(f, 'maisClientesParaReativar em actions/reativar-clientes.ts').toBeTypeOf('function')
  return f!
}

describe('A18 da 43ª: o "Ver mais" do Reativar abre o resto do recorte no próprio quadro', () => {
  it('a página seguinte vem da MESMA conta, a partir das que o quadro já mostra, com o desenho das primeiras', async () => {
    const r = await (await acao())({ deslocamento: 3, unidade: null })
    expect('error' in r, JSON.stringify(r)).toBe(false)
    if ('error' in r) return
    expect(pedidosDaConta).toHaveLength(1)
    expect(pedidosDaConta[0]).toMatchObject({ tenantId: 'rede-1', deslocamento: 3 })
    expect(Number(pedidosDaConta[0]!.limite)).toBeGreaterThan(3)
    expect(r.total).toBe(9)
    expect(r.clientes.map(c => c.id)).toEqual(['c4', 'c5'])
    expect(r.clientes[0]).toMatchObject({ diasSemVir: null, clienteDesde: '2017-03-01' })
    expect(r.clientes[1]).toMatchObject({ diasSemVir: 120, antesDoSistema: true, unidade: 'Centro' })
  })

  it('sem Clientes em Ver, recusa com { error } e não lê nada', async () => {
    ctx = { ...doAdmin(), permissions: { clients: 'NONE' } }
    const r = await (await acao())({ deslocamento: 3, unidade: null })
    expect(r).toHaveProperty('error')
    expect(pedidosDaConta).toHaveLength(0)
  })

  it('a cliente final não chega', async () => {
    ctx = { ...doAdmin(), isClient: true, tenantId: null }
    const r = await (await acao())({ deslocamento: 3, unidade: null })
    expect(r).toHaveProperty('error')
    expect(pedidosDaConta).toHaveLength(0)
  })

  it('a unidade da tela: a de outra rede, ou fora do alcance, é recusada; o contexto vence o pedido', async () => {
    const f = await acao()
    expect(await f({ deslocamento: 3, unidade: U_DE_OUTRA_REDE })).toHaveProperty('error')
    ctx = { ...doAdmin(), branchId: U_A, unidades: [U_A] }
    expect(await f({ deslocamento: 3, unidade: U_B })).not.toHaveProperty('error')
    expect(pedidosDaConta.at(-1)).toMatchObject({ unidade: { id: U_A } })
    expect(pedidosDaConta.every(p => (p.unidade as { id?: string } | null)?.id !== U_B)).toBe(true)
  })

  it('o deslocamento inválido é recusado', async () => {
    const f = await acao()
    expect(await f({ deslocamento: -1, unidade: null })).toHaveProperty('error')
    expect(await f({ deslocamento: 1.5, unidade: null })).toHaveProperty('error')
    expect(pedidosDaConta).toHaveLength(0)
  })

  it('o link diz quantas faltam e o total, e junta a página sem repetir ninguém', async () => {
    const q = await import('@/components/shared/quadros-de-clientes') as Record<string, unknown>
    const rotulo = q.rotuloDoVerMais as ((mostradas: number, total: number) => string) | undefined
    const juntar = q.juntarClientesDoReativar as (<T extends { id: string }>(a: T[], b: T[]) => T[]) | undefined
    expect(rotulo, 'rotuloDoVerMais').toBeTypeOf('function')
    expect(rotulo!(3, 9)).toBe('Ver mais 6 (9 no total)')
    expect(juntar, 'juntarClientesDoReativar').toBeTypeOf('function')
    expect(juntar!([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map(c => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('o quadro não leva mais à lista de Clientes: o "Ver mais" chama a action, e as linhas novas são as mesmas', () => {
    const q = ler('components/shared/quadros-de-clientes.tsx')
    expect(q).not.toMatch(/hrefVerTodas/)
    const lista = ler('components/shared/lista-do-reativar.tsx')
    expect(lista).toMatch(/^'use client'/)
    expect(lista).toMatch(/carregarMais\(\{ deslocamento: /)
    expect(lista).toMatch(/<LinhaDoReativar\b/)
    expect(lista).toMatch(/rotuloDoVerMais\(/)
    for (const p of ['app/admin/dashboard/page.tsx', 'app/[slug]/dashboard/page.tsx']) {
      const t = ler(p)
      expect(t, p).not.toMatch(/hrefVerTodas/)
      expect(t, p).toMatch(/carregarMais=\{maisClientesParaReativar\}/)
    }
    const a = ler('actions/reativar-clientes.ts')
    expect(a).toMatch(/^'use server'/)
    expect(a).toMatch(/getClientesParaReativarDoRecorte\(/)
  })

  it('a conta pagina no banco: o deslocamento vai à função, com a ordem estável', () => {
    const u = ler('lib/metrics/unidade.ts')
    expect(u).toMatch(/p_deslocamento/)
    const { nome, sql } = ultimaQueMexeEm('metrics_clientes_para_reativar_rede')
    expect(sql, nome).toMatch(/p_deslocamento integer default 0/i)
    expect(sql, nome).toMatch(/limit p_limite\s+offset greatest\(coalesce\(p_deslocamento, 0\), 0\)/)
    expect(sql, nome).toMatch(/order by ultima_visita asc nulls last, name, id/)
    expect(sql, nome).toMatch(/drop function if exists public\.metrics_clientes_para_reativar_rede\(uuid, timestamp with time zone, integer, uuid\)/)
    expect(sql, nome).toMatch(/grant execute on function public\.metrics_clientes_para_reativar_rede\(uuid, timestamp with time zone, integer, uuid, integer\) to service_role/)
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`), nome).toBe(true)
  })
})
