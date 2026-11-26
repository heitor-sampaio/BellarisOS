import { describe, it, expect, vi } from 'vitest'
import type { TenantContext, ResolvedPermissions, ReportTab } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * A31 da 32ª simulação (2026-11-26), o Copilot (CW-03, CW-04, CY-02, CY-07):
 *  (a) a Nadja (rede inteira, Financeiro em Ver; Relatórios com Visão geral,
 *      Vendas e Agenda) pediu "quanto a rede faturou hoje, por unidade?": a
 *      Visão geral vinha sem o "Faturamento por unidade" que a tela dela
 *      mostra, e o Copilot mandava abrir a aba Financeiro, que ela não tem.
 *  (b) a Gilvana (Chapecó e Passo Fundo, sem o Financeiro) pediu o
 *      faturamento de Cascavel: a recusa foi pelo dinheiro, sem dizer que
 *      Cascavel está fora do alcance e sem a lista das dela (CW-03).
 *  (c) a Suelen pediu "receba a Limpeza da Isabela", já recebida: "Não há
 *      comanda aberta", sem dizer que ela já foi recebida.
 *  (d) "quanto eu tenho de comissão?" sem o Financeiro: ver as comissões pede
 *      o Financeiro em Ver (QV-02), não em Gerenciar.
 */
const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(p: Partial<ResolvedPermissions>, extra: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Nadja', roleLabel: 'Coordenação',
    tenantId: 't1', branchId: null, unidades: null, role: 'RECEPTIONIST', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', ...p } as ResolvedPermissions,
    reportTabs: ['overview', 'vendas', 'agenda'] as ReportTab[], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...extra,
  } as TenantContext
}

vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo', fusoDaRede: async () => 'America/Sao_Paulo', fusoDoRecorte: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/unidades/da-tela', () => ({
  unidadesParaLer: async () => [{ id: 'bCha', name: 'Chapecó', slug: 'cha', ativa: true }, { id: 'bPF', name: 'Passo Fundo', slug: 'pf', ativa: true }],
}))
vi.mock('@/lib/copilot/ferramentas/comum', async orig => ({
  ...(await orig<typeof import('@/lib/copilot/ferramentas/comum')>()),
  resolverUnidade: async () => ({ unidade: null }),
  idsDasUnidades: async () => ['bCha', 'bPF'],
  nomesPorId: async () => new Map([['bCha', 'Chapecó'], ['bPF', 'Passo Fundo']]),
  ondeProcurou: async () => 'Chapecó e Passo Fundo',
  fusosPorUnidade: async () => new Map([['bCha', 'America/Sao_Paulo'], ['bPF', 'America/Sao_Paulo']]),
  resolverCliente: async () => ({ id: 'cIsa', nome: 'Isabela Tomasi' }),
}))
const NUCLEO = {
  revenueCash: 600, revenuePending: 0, expensesCash: 0, serviceRevenue: 600,
  appointmentsCompleted: 3, appointmentsTotal: 3, appointmentsCancelled: 0, appointmentsNoShow: 0,
  scheduledMinutes: 0, newClients: 1, commissionsOpen: 0, commissionsPaid: 0, transactionsCount: 0, appointmentsCharged: 0,
}
vi.mock('@/lib/metrics/dos-modulos', () => ({
  getCoreDosModulos: async () => ({ ...NUCLEO }),
  getRelatorioDosModulos: async () => ({ receitaPorUnidade: [{ branchId: 'bCha', atual: 400, anterior: 0 }, { branchId: 'bPF', atual: 200, anterior: 0 }] }),
}))
vi.mock('@/lib/metrics/queries', async orig => ({
  ...(await orig<typeof import('@/lib/metrics/queries')>()),
  getTicketMedio: async () => ({ total: { valor: 200, clientesQuePagaram: 3 }, porUnidade: {} }),
  getResultadoDoEstoque: async () => ({ total: { compraDeEstoque: 0, consumoDeInsumo: 0 }, porUnidade: {} }),
  getEmAberto: async () => ({ aReceber: 0, aPagar: 0, proximoAReceber: null, proximoAPagar: null }),
}))
const PAGA = {
  id: 'k9', numero: 14, origem: 'ATENDIMENTO', abertaEm: '2026-11-26T13:00:00Z', canceladaEm: null, canceladaMotivo: null,
  clienteId: 'cIsa', cliente: 'Isabela Tomasi', agendamentoId: 'ap1', procedimento: 'Limpeza', profissional: 'Dr. Otaviano',
  agendadoPara: null, atendimento: 'COMPLETED', valor: 200, paga: true, pagaEm: '2026-11-26T15:00:00Z', recebido: 200, forma: 'CREDIT_CARD',
  estornada: false, planoId: null, emAberto: 0, parcelasEmAberto: 0, proximaParcela: null, produtos: 0, jaPago: 0, formas: [],
  desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
}
vi.mock('@/lib/pdv/comandas', () => ({
  comandasDoPdv: async ({ situacao, branchId }: { situacao: string; branchId: string }) => (situacao === 'PAGAS' && branchId === 'bCha' ? [PAGA] : []),
}))
const contexto = (c: TenantContext) => ({ ctx: c, admin: {}, pagina: '/admin/dashboard', slugDoPortal: null }) as never

describe('A31 (a): a Visão geral do Copilot traz o faturamento por unidade, como a tela', () => {
  it('com o Financeiro em Ver e mais de uma unidade: faturamentoPorUnidade', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const d = (await indicadores.executar(contexto(ctx({ reports: 'VIEW', financial: 'VIEW' })), { aba: 'overview' })).dados as Record<string, unknown>
    expect(d.faturamentoPorUnidade).toEqual([
      { unidade: 'Chapecó', atual: 'R$ 400,00', anterior: 'R$ 0,00' },
      { unidade: 'Passo Fundo', atual: 'R$ 200,00', anterior: 'R$ 0,00' },
    ].map(x => ({ ...x, atual: expect.stringContaining(x.atual.slice(3)), anterior: expect.stringContaining(x.anterior.slice(3)) })))
  })

  it('diz quais abas ela abre — a Financeiro, que ela não tem, não entra', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const d = (await indicadores.executar(contexto(ctx({ reports: 'VIEW', financial: 'VIEW' })), { aba: 'overview' })).dados as Record<string, unknown>
    expect(String(d.abasQueElaAbre)).toMatch(/Visão geral/)
    expect(String(d.abasQueElaAbre)).not.toMatch(/Financeiro/)
  })

  it('sem a aba Vendas, o recado do dinheiro não manda abrir a aba Vendas', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const semVendas = ctx({ reports: 'VIEW' }, { reportTabs: ['overview'] as ReportTab[] })
    const d = (await indicadores.executar(contexto(semVendas), { aba: 'overview' })).dados as Record<string, unknown>
    expect(String(d.semOFinanceiro)).toMatch(/Financeiro/)
    expect(String(d.semOFinanceiro)).not.toMatch(/aba Vendas/)
  })
})

describe('A31 (c): "receba" a comanda já recebida diz que já foi recebida', () => {
  it('sem comanda aberta da cliente, vem a recebida, com o número e o link', async () => {
    const { comandasAbertas } = await import('@/lib/copilot/ferramentas/vendas')
    const c = ctx({ cashier: 'MANAGE' }, { branchId: 'bCas', unidades: ['bCas'] })
    const d = (await comandasAbertas.executar(contexto(c), { cliente: 'Isabela' })).dados as Record<string, unknown>
    expect(d.quantidade).toBe(0)
    const ja = d.jaRecebidas as { numero: number; procedimento: string; href: string }[]
    expect(ja).toHaveLength(1)
    expect(ja[0]).toMatchObject({ numero: 14, procedimento: 'Limpeza' })
    expect(String(d.nota)).toMatch(/já foi recebida/)
  })
})

describe('A31 (b) e (d): o prompt', () => {
  const unidades = { rede: 'Ninfeia', unidade: 'Chapecó', unidades: ['Chapecó', 'Passo Fundo'], pagina: '/cha/dashboard', slugDoPortal: 'cha' }
  it('a unidade de fora se recusa pelo alcance, com a lista das dela, mesmo quando o pedido é de dinheiro', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const gilvana = ctx({ agenda: 'MANAGE', clients: 'MANAGE', cashier: 'MANAGE', team: 'MANAGE' }, { branchId: 'bCha', unidades: ['bCha', 'bPF'], reportTabs: [] })
    const t = instrucoesDoCopilot(gilvana, unidades)
    expect(t).toMatch(/fora do seu alcance\. As suas: “Chapecó” e “Passo Fundo”/)
    expect(t).toMatch(/mesmo quando o pedido também esbarra na permissão/)
  })

  it('sem o Financeiro (e sem comissão no nome dela): ver as comissões pede o Financeiro em Ver', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const gilvana = ctx({ agenda: 'MANAGE', clients: 'MANAGE' }, { branchId: 'bCha', unidades: ['bCha', 'bPF'], reportTabs: [] })
    expect(instrucoesDoCopilot(gilvana, unidades)).toMatch(/ver as comissões pede o Financeiro em Ver/)
  })
})
