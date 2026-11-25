import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A entrada da cliente no portal e no app fica na Auditoria (AD-04 do
 * catálogo da Plataforma: o CF3 aprovado diz "entradas no
 * sistema (login)", sem recorte). O login pela tela e a sessão do app pulavam
 * a cliente (`if (user && !clienteId)`, `if (!claims.client_id)`).
 *
 * Decisão do Claude (catálogo de 24/11; "cada rede só vê a sua", CLAUDE.md
 * §5): a entrada fica na REDE em que ela entra — a do destino do login; com
 * várias redes e o seletor, a que ela escolhe nele. Quem agiu é a cliente
 * (`ator_tipo = 'cliente'`, a ficha daquela rede).
 */

const rpcs: { fn: string; args: unknown }[] = []
let fichas: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => { rpcs.push({ fn, args }); return { data: null, error: null } },
    from: (tabela: string) => {
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'in', 'order', 'update', 'or']) b[op] = () => b
      b.then = (ok: (r: unknown) => unknown) => Promise.resolve({
        data: tabela === 'clients' ? fichas : [{ id: 'b1', slug: 'centro', name: 'Centro', tenant_id: 't1' }, { id: 'b2', slug: 'sul', name: 'Sul', tenant_id: 't2' }],
        error: null,
      }).then(ok)
      return b
    },
  }),
}))
vi.mock('@/lib/clientes/disponibilidade', () => ({ fichasQueAbrem: async (f: unknown[]) => f }))

beforeEach(() => { rpcs.length = 0 })

const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')

describe('a entrada da cliente na Auditoria', () => {
  it('com uma rede, fica na ficha dessa rede', async () => {
    fichas = [{ id: 'c1', tenant_id: 't1', portal_ligado_em: '2026-11-01T00:00:00Z', portal_ultima_entrada_em: null, portal_ultima_unidade: null }]
    const { registrarEntradaDaClienteNaAuditoria } = await import('@/lib/clientes/entrada-na-auditoria')
    await registrarEntradaDaClienteNaAuditoria('auth-1')
    expect(rpcs).toEqual([{ fn: 'auditoria_registrar_entrada_da_cliente', args: { p_client: 'c1' } }])
  })

  it('com o seletor, ainda não é de rede nenhuma: fica para a escolha', async () => {
    fichas = [
      { id: 'c1', tenant_id: 't1', portal_ligado_em: '2026-11-01T00:00:00Z', portal_ultima_entrada_em: null, portal_ultima_unidade: null },
      { id: 'c2', tenant_id: 't2', portal_ligado_em: '2026-11-02T00:00:00Z', portal_ultima_entrada_em: null, portal_ultima_unidade: null },
    ]
    const { registrarEntradaDaClienteNaAuditoria } = await import('@/lib/clientes/entrada-na-auditoria')
    await registrarEntradaDaClienteNaAuditoria('auth-1')
    expect(rpcs).toEqual([])
  })

  it('o login pela tela, a sessão do app e a escolha no seletor registram a da cliente', () => {
    expect(fonte('actions/auth.ts')).toMatch(/if \(user && clienteId\) await registrarEntradaDaClienteNaAuditoria\(user\.id\)/)
    expect(fonte('app/api/auth/session/route.ts')).toMatch(/if \(claims\.client_id\) await registrarEntradaDaClienteNaAuditoria\(usuario\.id\)/)
    expect(fonte('actions/portal-redes.ts')).toMatch(/registrarEntradaNaAuditoriaDaFicha\(ficha\.clientId\)/)
  })

  it('a função do banco grava a cliente como quem agiu, na rede da ficha, e fica só com o service_role', () => {
    const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
    const arq = readdirSync(dir).find(f => /^202612034\d{5}_auditoria_entrada_da_cliente\.sql$/.test(f))
    expect(arq, 'a migration da faixa R').toBeTruthy()
    const sql = readFileSync(join(dir, arq!), 'utf8')
    expect(sql).toMatch(/create or replace function public\.auditoria_registrar_entrada_da_cliente\(p_client uuid\)/)
    expect(sql).toMatch(/'cliente'/)
    expect(sql).toMatch(/'entrou'/)
    expect(sql).toMatch(/revoke execute on function public\.auditoria_registrar_entrada_da_cliente\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.auditoria_registrar_entrada_da_cliente\(uuid\) to service_role/)
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
