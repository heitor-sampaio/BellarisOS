import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

vi.mock('server-only', () => ({}))

/**
 * A conta da rede com o BellarisOS é só da Admin da rede (o cargo de sistema
 * gravado, `ctx.isNetworkAdmin`). O Heitor, 18/11: a configuração da rede toda
 * é "só pela conta admin" (CLAUDE.md §11). "A rede inteira" com Configurações
 * em Gerenciar era o critério de antes, e ainda valia para:
 *  - o aviso da assinatura no topo, a fatura e o "Pagar" na conta suspensa, o
 *    sino da assinatura e o do suporte entrando (AS-15/16/17/20, SU-11);
 *  - os chamados dos colegas (Q04 do catálogo, resolvida na revisão de 24/11);
 *  - o "Testar conexão" das integrações (IG-02: as integrações são só da Admin).
 */

const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')
const corpoDe = (src: string, nome: string) => {
  const ini = src.indexOf(`export async function ${nome}(`)
  expect(ini, nome).toBeGreaterThan(-1)
  const fim = src.indexOf('\nexport ', ini + 10)
  return src.slice(ini, fim === -1 ? undefined : fim)
}

describe('o aviso da assinatura', () => {
  it('só a Admin da rede; "A rede inteira" com Configurações em Gerenciar não basta', async () => {
    const { administraARede } = await import('@/lib/redes/aviso')
    const base = { tenantId: 't', isClient: false }
    expect(administraARede({ ...base, isNetworkAdmin: true })).toBe(true)
    expect(administraARede({ ...base, isNetworkAdmin: false, branchId: null, permissions: { settings: 'MANAGE' } } as never)).toBe(false)
    expect(administraARede({ tenantId: 't', isClient: true, isNetworkAdmin: false })).toBe(false)
  })
})

describe('a conta suspensa', () => {
  it('a fatura e o "Pagar" só à Admin da rede (o cargo gravado), não à matriz', () => {
    const c = fonte('app/conta-suspensa/page.tsx')
    expect(c).toMatch(/ehAdminDaRede/)
    expect(c).not.toMatch(/settings === 'MANAGE'/)
    expect(c).not.toMatch(/getCachedRolePermissions/)
  })
})

describe('o sino da assinatura e do suporte', () => {
  it('vai à Admin da rede pelo cargo de sistema, não a quem tem Configurações em Gerenciar', () => {
    const c = readFileSync(path.join(raiz, '..', '..', 'packages', 'nucleo', 'src', 'lib', 'suporte', 'avisos.ts'), 'utf8')
    expect(c).toMatch(/\.eq\('key', 'NETWORK_ADMIN'\)\.eq\('is_system', true\)/)
    expect(c).not.toMatch(/'settings'/)
  })
})

describe('os chamados dos colegas', () => {
  it('só a Admin da rede os vê', () => {
    const c = fonte('actions/chamados.ts')
    expect(c).toMatch(/function veARede\(ctx: TenantContext\): boolean \{\s*return ctx\.isNetworkAdmin\s*\}/)
    expect(c).not.toMatch(/can\(ctx, 'settings', 'MANAGE'\)/)
  })
})

describe('o "Testar conexão" das integrações', () => {
  it('as duas actions recusam quem não é a Admin da rede', () => {
    const c = fonte('actions/integrations.ts')
    for (const nome of ['testWhatsAppConnection', 'testAdsConnection']) {
      expect(corpoDe(c, nome), nome).toMatch(/recusaDaConfigDaRede\(ctx\)/)
    }
  })
})
