import { describe, it, expect, vi, afterEach } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * A32, A33 e A16 da 23ª simulação (2026-11-17), o Copilot.
 *
 * A32 [3]: o cartão "Agenda" de 17 a 19/11 nas duas unidades dizia só
 * "10:00 · Bianca Lopes" — sem o dia e sem a unidade. O dia vai quando o
 * período tem mais de um; a unidade, quando a pessoa alcança mais de uma.
 * A33 [3]: o cartão "Encontrado para…" não dizia que os agendamentos são só
 * da unidade da tela (a busca é recortada por ela — busca.md).
 * A16 [design]: o botão flutuante cobria o "Confirmar estorno" a 1440×900.
 */

const UNIDADES = [{ id: 'b-ren', name: 'Alecrim Renascença', slug: 'alecrim-renascenca' }, { id: 'b-coh', name: 'Alecrim Cohama', slug: 'alecrim-cohama' }]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Fortaleza',
  fusoDaRede: async () => 'America/Fortaleza',
}))
const buscarTudo = vi.fn()
vi.mock('@/actions/busca', () => ({ buscarTudo: (...a: unknown[]) => buscarTudo(...a) }))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(abrangencia: Abrangencia): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u-marcos', userName: 'Marcos', roleLabel: 'Dono',
    tenantId: 't1', ...abrangencia, role: 'NETWORK_ADMIN', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', agenda: 'MANAGE', clients: 'MANAGE', team: 'VIEW' } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: abrangencia.branchId === null, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}
type Abrangencia = { branchId: string | null; unidades: string[] | null }
const DA_REDE: Abrangencia = { branchId: null, unidades: null }
const DUAS: Abrangencia = { branchId: 'b-ren', unidades: ['b-ren', 'b-coh'] }
const UMA: Abrangencia = { branchId: 'b-ren', unidades: ['b-ren'] }

function adminFalso(tabelas: Record<string, Record<string, unknown>[]>, abrangencia: Abrangencia = DA_REDE, slugDoPortal: string | null = null) {
  const admin = {
    from(tabela: string) {
      let um = false
      const encadeia: unknown = new Proxy({}, {
        get(_, prop: string) {
          if (prop === 'then') {
            const linhas = tabelas[tabela] ?? []
            return (ok: (v: unknown) => void) => ok({ data: um ? (linhas[0] ?? null) : linhas, error: null })
          }
          return () => {
            if (prop === 'single' || prop === 'maybeSingle') um = true
            return encadeia
          }
        },
      })
      return encadeia
    },
    rpc: async () => ({ data: [], error: null }),
  }
  const pagina = slugDoPortal ? `/${slugDoPortal}/dashboard` : '/admin/dashboard'
  return { ctx: ctx(abrangencia), admin: admin as never, pagina, slugDoPortal }
}

const ag = (id: string, quando: string, unidade = 'b-ren') => ({
  id, scheduled_at: quando, duration_min: 60, status: 'SCHEDULED', branch_id: unidade, client_id: 'c-1', procedure_id: 'p-1', professional_id: 'u-otavio',
})
const TABELAS = (linhas: Record<string, unknown>[]) => ({
  appointments: linhas,
  clients: [{ id: 'c-1', name: 'Bianca Lopes' }], procedures: [{ id: 'p-1', name: 'Massagem' }],
  users: [{ id: 'u-otavio', name: 'Dr. Otávio', is_active: true }], branches: UNIDADES,
})
type CartaoDeLinks = { tipo: 'links'; titulo?: string; itens: { texto: string; detalhe?: string }[] }

afterEach(() => { vi.useRealTimers(); buscarTudo.mockReset() })

describe('A32: o cartão "Agenda" diz o dia e a unidade quando precisa', () => {
  it('período de vários dias, quem alcança as duas unidades: o dia no item e a unidade no detalhe', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const c = adminFalso(TABELAS([ag('a-1', '2026-11-18T13:00:00.000Z'), ag('a-2', '2026-11-19T14:00:00.000Z', 'b-coh')]))
    const r = await agendamentos.executar(c, { de: '2026-11-17', ate: '2026-11-19' })
    const cartao = r.cartao as CartaoDeLinks
    expect(cartao.itens[0]!.texto).toContain('18/11')
    expect(cartao.itens[0]!.texto).toContain('10:00')
    expect(cartao.itens[0]!.texto).toContain('Bianca Lopes')
    expect(cartao.itens[1]!.texto).toContain('19/11')
    expect(cartao.itens[0]!.detalhe).toContain('Alecrim Renascença')
    expect(cartao.itens[1]!.detalhe).toContain('Alecrim Cohama')
  })

  it('quem tem duas unidades, pedindo uma, num dia só: a unidade no detalhe, sem o dia', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const c = adminFalso(TABELAS([ag('a-1', '2026-11-18T13:00:00.000Z')]), DUAS, 'alecrim-renascenca')
    const r = await agendamentos.executar(c, { de: '2026-11-18' })
    const cartao = r.cartao as CartaoDeLinks
    expect(cartao.itens[0]!.texto).toBe('10:00 · Bianca Lopes')
    expect(cartao.itens[0]!.detalhe).toContain('Alecrim Renascença')
  })

  it('um dia e uma unidade só: a hora, como antes, e o detalhe sem unidade', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'))
    const { agendamentos } = await import('@/lib/copilot/ferramentas/agenda')
    const c = adminFalso(TABELAS([ag('a-1', '2026-11-18T13:00:00.000Z')]), UMA, 'alecrim-renascenca')
    const r = await agendamentos.executar(c, { de: '2026-11-18' })
    const cartao = r.cartao as CartaoDeLinks
    expect(cartao.itens[0]!.texto).toBe('10:00 · Bianca Lopes')
    expect(cartao.itens[0]!.detalhe).not.toContain('Alecrim')
  })
})

describe('A33: o "Encontrado para…" diz que os agendamentos são da unidade da tela', () => {
  const resultado = {
    grupos: [
      { tipo: 'cliente', itens: [{ tipo: 'cliente', id: 'c-1', titulo: 'Bianca Lopes', subtitulo: null }] },
      { tipo: 'agendamento', itens: [{ tipo: 'agendamento', id: 'a-1', titulo: 'Bianca Lopes', subtitulo: 'qua., 18/11 às 10:00 · Massagem' }] },
    ],
  }

  it('quem alcança duas unidades, na tela de uma: o título diz de qual são os agendamentos', async () => {
    buscarTudo.mockResolvedValue(resultado)
    const { buscar } = await import('@/lib/copilot/ferramentas/buscar')
    const r = await buscar.executar(adminFalso({}, DUAS, 'alecrim-renascenca'), { termo: 'Bianca' })
    expect((r.cartao as CartaoDeLinks).titulo).toContain('Alecrim Renascença')
    expect(JSON.stringify(r.dados)).toContain('Alecrim Renascença')
  })

  it('quem é da rede, no portal de uma unidade: também', async () => {
    buscarTudo.mockResolvedValue(resultado)
    const { buscar } = await import('@/lib/copilot/ferramentas/buscar')
    const r = await buscar.executar(adminFalso({}, DA_REDE, 'alecrim-cohama'), { termo: 'Bianca' })
    expect((r.cartao as CartaoDeLinks).titulo).toContain('Alecrim Cohama')
  })

  it('no portal da rede (sem recorte), ou com uma unidade só, nada a dizer', async () => {
    buscarTudo.mockResolvedValue(resultado)
    const { buscar } = await import('@/lib/copilot/ferramentas/buscar')
    expect((await buscar.executar(adminFalso({}, DA_REDE, null), { termo: 'Bianca' })).cartao).toMatchObject({ titulo: 'Encontrado para "Bianca"' })
    expect((await buscar.executar(adminFalso({}, UMA, 'alecrim-renascenca'), { termo: 'Bianca' })).cartao).toMatchObject({ titulo: 'Encontrado para "Bianca"' })
  })

  it('sem agendamento no resultado, nada a dizer', async () => {
    buscarTudo.mockResolvedValue({ grupos: [resultado.grupos[0]] })
    const { buscar } = await import('@/lib/copilot/ferramentas/buscar')
    const r = await buscar.executar(adminFalso({}, DUAS, 'alecrim-renascenca'), { termo: 'Bianca' })
    expect((r.cartao as CartaoDeLinks).titulo).toBe('Encontrado para "Bianca"')
  })
})

describe('A16: o que ganha o foco embaixo do botão flutuante sobe acima dele', () => {
  const botao = { top: 834, left: 1300, right: 1420, bottom: 880 }
  it('o grupo do "Confirmar estorno" embaixo do botão: rola o que falta, com folga', async () => {
    const { quantoRolarAcimaDoBotao } = await import('@/lib/copilot/abaixo-do-botao')
    // O grupo vai de 760 a 880 (o fim dele atrás do botão, que começa em 834).
    expect(quantoRolarAcimaDoBotao({ top: 760, bottom: 880, left: 400, right: 1410 }, botao, 68)).toBe(880 - 834 + 12)
  })
  it('fora da coluna do botão, ou acima dele: não rola', async () => {
    const { quantoRolarAcimaDoBotao } = await import('@/lib/copilot/abaixo-do-botao')
    expect(quantoRolarAcimaDoBotao({ top: 760, bottom: 880, left: 400, right: 1200 }, botao, 68)).toBe(0)
    expect(quantoRolarAcimaDoBotao({ top: 500, bottom: 600, left: 400, right: 1410 }, botao, 68)).toBe(0)
  })
  it('nunca leva o topo do que ganhou o foco para trás da topbar', async () => {
    const { quantoRolarAcimaDoBotao } = await import('@/lib/copilot/abaixo-do-botao')
    expect(quantoRolarAcimaDoBotao({ top: 100, bottom: 880, left: 400, right: 1410 }, botao, 68)).toBe(100 - 68 - 12)
  })
  it('o Copilot e o botão de fora do plano usam', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const f of ['components/copilot/copilot.tsx', 'components/copilot/copilot-fora-do-plano.tsx']) {
      expect(readFileSync(join(__dirname, '..', f), 'utf8'), f).toContain('useFocoAcimaDoBotao(')
    }
  })
})
