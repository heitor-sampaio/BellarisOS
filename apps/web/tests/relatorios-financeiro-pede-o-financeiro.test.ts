import { describe, it, expect, vi } from 'vitest'
import type { TenantContext, ResolvedPermissions, ReportTab } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * "financeiro é uma coisa, vendas é outra. financeiro ve entrada/saida/lucro,
 * tudo. vendas é sobre performance de vendas." — e "ok" à proposta (o Heitor,
 * 2026-11-23):
 *  (a) a aba FINANCEIRO dos Relatórios (entradas, saídas, lucro) só vale com o
 *      módulo Financeiro pelo menos em Ver — na tela de Cargos, a caixa fica
 *      desligada sem ele, com "pede o Financeiro";
 *  (b) a aba VENDAS é independente: quem vende vê a performance sem o Financeiro;
 *  (c) na Visão geral, os cartões de entrada, saída e lucro só com o Financeiro;
 *      os outros (atendimentos, clientes, agenda…) continuam;
 *  (d) o Copilot segue a mesma divisão.
 */

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions>, reportTabs: ReportTab[]): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Ana', roleLabel: 'Comercial',
    tenantId: 't1', branchId: null, unidades: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', ...permissions } as ResolvedPermissions,
    reportTabs, providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}
const ABAS: ReportTab[] = ['overview', 'financeiro', 'vendas', 'agenda']
const semFinanceiro = ctx({ reports: 'VIEW' }, ABAS)
const comFinanceiro = ctx({ reports: 'VIEW', financial: 'VIEW' }, ABAS)

describe('(a)/(b) a aba Financeiro pede o Financeiro; a Vendas, não', () => {
  it('sem o Financeiro, a aba Financeiro não abre mesmo marcada; a Vendas abre', async () => {
    const { podeVerRelatorio } = await import('@/lib/auth')
    expect(podeVerRelatorio(semFinanceiro, 'financeiro')).toBe(false)
    expect(podeVerRelatorio(semFinanceiro, 'vendas')).toBe(true)
    expect(podeVerRelatorio(semFinanceiro, 'overview')).toBe(true)
  })

  it('com o Financeiro em Ver (e a aba marcada), abre', async () => {
    const { podeVerRelatorio } = await import('@/lib/auth')
    expect(podeVerRelatorio(comFinanceiro, 'financeiro')).toBe(true)
    expect(podeVerRelatorio(ctx({ reports: 'VIEW', financial: 'MANAGE' }, ['financeiro']), 'financeiro')).toBe(true)
  })

  it('a regra é UMA, pura, e a tela de Cargos a lê com o motivo à vista', async () => {
    const { abaDeRelatorioVale, abasQueValem, motivoDaAbaFechada } = await import('@/lib/permissions')
    const niveis = { ...NO_PERMISSIONS, reports: 'VIEW' } as ResolvedPermissions
    expect(abaDeRelatorioVale('financeiro', niveis)).toBe(false)
    expect(abaDeRelatorioVale('vendas', niveis)).toBe(true)
    expect(abasQueValem(['overview', 'financeiro', 'vendas'], niveis)).toEqual(['overview', 'vendas'])
    expect(motivoDaAbaFechada('financeiro', niveis)).toBe('pede o Financeiro')
    expect(motivoDaAbaFechada('financeiro', { ...niveis, financial: 'VIEW' })).toBeNull()
    expect(motivoDaAbaFechada('vendas', niveis)).toBeNull()
  })
})

describe('(c) a Visão geral: entrada, saída e lucro só com o Financeiro', () => {
  it('sem o Financeiro, os cartões de dinheiro saem e os outros ficam', async () => {
    const { cartoesDaVisaoGeral } = await import('@/lib/metrics/visao-geral')
    const sem = cartoesDaVisaoGeral(semFinanceiro.permissions)
    for (const c of ['faturamento', 'despesas', 'lucro', 'evolucao', 'faturamentoPorUnidade', 'formaDePagamento'] as const) {
      expect(sem, c).not.toContain(c)
    }
    for (const c of ['atendimentos', 'novosClientes', 'ticketMedio', 'topProcedimentos', 'topProfissionais', 'statusDosAgendamentos'] as const) {
      expect(sem, c).toContain(c)
    }
  })

  it('com o Financeiro em Ver, todos', async () => {
    const { cartoesDaVisaoGeral, CARTOES_DA_VISAO_GERAL } = await import('@/lib/metrics/visao-geral')
    expect(cartoesDaVisaoGeral(comFinanceiro.permissions)).toEqual([...CARTOES_DA_VISAO_GERAL])
  })
})

// -- (d) o Copilot ------------------------------------------------------------
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
  fusoDoRecorte: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/unidades/da-tela', () => ({ unidadesParaLer: async () => [{ id: 'b1', name: 'Centro', slug: 'centro', ativa: true }] }))
vi.mock('@/lib/copilot/ferramentas/comum', async orig => ({
  ...(await orig<typeof import('@/lib/copilot/ferramentas/comum')>()),
  resolverUnidade: async () => ({ unidade: null }),
  idsDasUnidades: async () => ['b1'],
  nomesPorId: async () => new Map([['b1', 'Centro']]),
}))
const NUCLEO = {
  revenueCash: 1100, revenuePending: 0, expensesCash: 234.42, serviceRevenue: 1100,
  appointmentsCompleted: 3, appointmentsTotal: 3, appointmentsCancelled: 0, appointmentsNoShow: 0,
  scheduledMinutes: 0, newClients: 2, commissionsOpen: 0, commissionsPaid: 0, transactionsCount: 0, appointmentsCharged: 0,
}
vi.mock('@/lib/metrics/dos-modulos', () => ({
  getCoreDosModulos: async () => ({ ...NUCLEO }),
  getRelatorioDosModulos: async () => ({}),
}))
vi.mock('@/lib/metrics/queries', async orig => ({
  ...(await orig<typeof import('@/lib/metrics/queries')>()),
  getTicketMedio: async () => ({ total: { valor: 550, clientesQuePagaram: 2 }, porUnidade: {} }),
  getResultadoDoEstoque: async () => ({ total: { compraDeEstoque: 0, consumoDeInsumo: 0 }, porUnidade: {} }),
  getEmAberto: async () => ({ aReceber: 300, aPagar: 0, proximoAReceber: null, proximoAPagar: null }),
}))
const contexto = (c: TenantContext) => ({ ctx: c, admin: {} }) as unknown as Parameters<typeof import('@/lib/copilot/ferramentas/indicadores')['indicadores']['executar']>[0]

describe('(d) o Copilot segue a mesma divisão', () => {
  it('sem o Financeiro, a aba financeiro é recusada e diz por quê', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const r = await indicadores.executar(contexto(semFinanceiro), { aba: 'financeiro' })
    expect(r.dados).toEqual({ erro: expect.stringContaining('pede o Financeiro') })
  })

  it('sem o Financeiro, a visão geral não traz entrada, saída nem lucro; os atendimentos ficam', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const d = (await indicadores.executar(contexto(semFinanceiro), { aba: 'overview' })).dados as Record<string, unknown>
    for (const k of ['faturamento', 'faturamentoAnterior', 'aReceber', 'despesas', 'insumoConsumido', 'taxasDaMaquininha', 'comissoesLancadas', 'lucro', 'margem']) {
      expect(d, k).not.toHaveProperty(k)
    }
    expect(d.atendimentosConcluidos).toBe(3)
    expect(d.novosClientes).toBe(2)
    expect(d.semOFinanceiro).toEqual(expect.stringContaining('Financeiro'))
  })

  it('com o Financeiro, a visão geral traz o dinheiro', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const d = (await indicadores.executar(contexto(comFinanceiro), { aba: 'overview' })).dados as Record<string, unknown>
    for (const k of ['faturamento', 'aReceber', 'despesas', 'lucro']) expect(d, k).toHaveProperty(k)
    expect(d).not.toHaveProperty('semOFinanceiro')
  })
})

describe('(e) a aba que não vale não segura os Relatórios abertos', () => {
  // Um cargo gravado antes da regra com SÓ a aba Financeiro e sem o Financeiro
  // abriria os Relatórios vazios ("Nenhum relatório liberado"): o buildContext
  // conta só as abas que valem, e sem nenhuma o módulo vale NONE (A5).
  it('o buildContext filtra as abas pelas que valem, depois do plano', async () => {
    const { readFileSync } = await import('node:fs')
    const c = readFileSync('lib/auth.ts', 'utf8')
    const plano = c.indexOf('abasForaDoPlano(plano)')
    const vale = c.indexOf('abasQueValem(reportTabs, permissions)')
    expect(vale, 'filtra pelas que valem').toBeGreaterThan(-1)
    expect(vale, 'depois do corte do plano').toBeGreaterThan(plano)
  })

  it('o "cargo acima" compara as abas que valem no cargo dado', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('lib/equipe/cargo-acima.ts', 'utf8')).toContain('abasQueValem(')
  })
})
