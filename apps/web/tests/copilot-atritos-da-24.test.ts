import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'
import { DEFINICOES } from '@/lib/metrics/definicoes'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O Copilot na 24ª simulação (2026-11-18).
 *
 * D1 [3]: "quanto saiu de despesa hoje em cada unidade" → "Centro R$ 150,
 * Bosque R$ 950, total R$ 1.100 … Serviços R$ 1.100" — a RECEITA. A aba
 * `financeiro` de `indicadores` devolvia `porUnidade`/`porCategoria` montados
 * com a receita, sem dizer que era receita, e nenhuma ferramenta tinha a
 * despesa por unidade. O certo era R$ 234,42 (Bosque 174,42; Centro 60): a
 * conta do Financeiro (`getByBranch`, `getComposicaoFinanceira`).
 * A40 [3]: o cartão da despesa veio com "Fornecedores" para a lavanderia,
 * escolhida por ele, e gravou assim. A categoria que a pessoa não disse vem
 * SUGERIDA no cartão, e se troca nele antes de confirmar.
 * A41 [4]: o "comparecimento" era uma conta do Copilot (2 de 6 = 33,33%, com
 * os futuros). Ele cita a métrica que existe, com o nome dela: a taxa de
 * conclusão (Relatórios), o aproveitamento (dashboard) e o comparecimento dos
 * primeiros atendimentos (comercial) — e não divide por conta própria.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

const BOSQUE = { id: 'b-bosque', name: 'Ipê Bosque', slug: 'ipe-bosque' }
const CENTRO = { id: 'b-centro', name: 'Ipê Centro', slug: 'ipe-centro' }

vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => [BOSQUE, CENTRO],
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Rio_Branco',
  fusoDaRede: async () => 'America/Rio_Branco',
  fusoDoRecorte: async () => 'America/Rio_Branco',
}))
vi.mock('@/lib/financeiro/vezes-da-rede', () => ({ maquininhasDaRede: async () => [] }))
// IND-01 (varredura de 18/11): os indicadores leem as unidades de LEITURA.
vi.mock('@/lib/unidades/da-tela', () => ({
  unidadesParaLer: async () => [{ ...BOSQUE, ativa: true }, { ...CENTRO, ativa: true }],
}))
vi.mock('@/lib/copilot/ferramentas/comum', async orig => ({
  ...(await orig<typeof import('@/lib/copilot/ferramentas/comum')>()),
  resolverUnidade: async (_c: unknown, pedido?: string | null) =>
    pedido ? { unidade: [BOSQUE, CENTRO].find(u => u.name.toLowerCase().includes(pedido.toLowerCase())) ?? BOSQUE } : { unidade: null },
  idsDasUnidades: async () => [BOSQUE.id, CENTRO.id],
  nomesPorId: async () => new Map([[BOSQUE.id, BOSQUE.name], [CENTRO.id, CENTRO.name]]),
  fusoDe: async () => 'America/Rio_Branco',
}))

/** O dia da rodada: receita R$ 1.100 (Bosque 950, Centro 150), despesa R$ 234,42 (Bosque 174,42, Centro 60). */
const NUCLEO_VAZIO = {
  revenueCash: 1100, revenuePending: 0, expensesCash: 234.42, serviceRevenue: 1100,
  appointmentsCompleted: 3, appointmentsTotal: 3, appointmentsCancelled: 0, appointmentsNoShow: 0,
  scheduledMinutes: 0, newClients: 0, commissionsOpen: 0, commissionsPaid: 0, transactionsCount: 0, appointmentsCharged: 0,
}
const FIM_DO_PERIODO = { appointmentsCompleted: 3, appointmentsTotal: 11 }
vi.mock('@/lib/metrics/dos-modulos', () => ({
  getCoreDosModulos: async (a: { to: Date }) => ({
    ...NUCLEO_VAZIO,
    // Até o FIM do período (a aba Agenda): 3 de 11 — os 8 que ainda vão acontecer entram.
    ...(a.to.getTime() > Date.now() ? FIM_DO_PERIODO : {}),
  }),
  getRelatorioDosModulos: async () => ({
    receitaPorUnidade: [{ branchId: BOSQUE.id, atual: 950, anterior: 0 }, { branchId: CENTRO.id, atual: 150, anterior: 0 }],
    receitaPorForma: [{ forma: 'PIX', valor: 1100 }],
    receitaPorCategoria: [{ categoria: 'Serviços', valor: 1100 }],
    consumoTotal: 0, porProcedimento: [], porProfissional: [], receitaDosAtendimentos: 0,
    execucoes: { atual: 0, anterior: 0 }, receitaPorCategoriaDeProcedimento: [],
    agendamentosPorStatus: [{ status: 'COMPLETED', n: 3 }, { status: 'SCHEDULED', n: 8 }],
    porDiaDaSemana: [], porOrigem: [],
    agendaPorUnidade: [
      { branchId: BOSQUE.id, total: 6, concluidos: 2, cancelados: 0, faltas: 0 },
      { branchId: CENTRO.id, total: 5, concluidos: 1, cancelados: 0, faltas: 0 },
    ],
    clientes: { totalAtivos: 0, porFaixa: [], porGenero: [], cidades: [], topClientes: [] },
    procedimentosPorFaixa: { temCustos: false, volume: [], margem: [] },
    comissoesPorProfissional: [],
    estoque: { valorEmEstoque: 0, criticos: 0, zerados: 0, valorPorCategoria: [], porUnidade: [], maisConsumidos: [] },
  }),
}))
vi.mock('@/lib/metrics/queries', async orig => ({
  ...(await orig<typeof import('@/lib/metrics/queries')>()),
  getByBranch: async () => [
    { ...NUCLEO_VAZIO, branchId: BOSQUE.id, branchName: BOSQUE.name, branchSlug: BOSQUE.slug, isActive: true, revenueCash: 950, expensesCash: 174.42, appointmentsCompleted: 2, appointmentsTotal: 2 },
    { ...NUCLEO_VAZIO, branchId: CENTRO.id, branchName: CENTRO.name, branchSlug: CENTRO.slug, isActive: true, revenueCash: 150, expensesCash: 60, appointmentsCompleted: 1, appointmentsTotal: 1 },
    // Uma unidade de fora do recorte não entra.
    { ...NUCLEO_VAZIO, branchId: 'b-outra', branchName: 'Outra', branchSlug: 'outra', isActive: true, expensesCash: 999 },
  ],
  getComposicaoFinanceira: async () => ({
    formas: [{ chave: 'PIX', valor: 1100 }],
    receitas: [{ chave: 'Serviços', valor: 1100 }],
    despesas: [{ chave: 'Fornecedores', valor: 174.42 }, { chave: 'Material de consumo (limpeza, copa)', valor: 60 }],
  }),
  getTicketMedio: async () => ({ total: { valor: null, clientesQuePagaram: 0 }, porUnidade: {} }),
  getResultadoDoEstoque: async () => ({ total: { compraDeEstoque: 0, consumoDeInsumo: 0 }, porUnidade: {} }),
  getEmAberto: async () => ({ aReceber: 0, aPagar: 0, proximoAReceber: null, proximoAPagar: null }),
}))

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(permissions: Partial<ResolvedPermissions> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u-henrique', userName: 'Henrique', roleLabel: 'Admin',
    tenantId: 't1', branchId: null, unidades: null, role: 'NETWORK_ADMIN', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'MANAGE', reports: 'VIEW', financial: 'MANAGE', cashier: 'MANAGE', ...permissions } as ResolvedPermissions,
    reportTabs: ['overview', 'financeiro', 'agenda', 'comercial'], providesServices: false, isNetworkAdmin: true, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
  } as TenantContext
}
const contexto = (c: TenantContext) => ({ ctx: c, admin: {} }) as unknown as Parameters<typeof import('@/lib/copilot/ferramentas/indicadores')['indicadores']['executar']>[0]

describe('D1: a despesa por unidade e por categoria é a despesa (a conta do Financeiro)', () => {
  it('a aba financeiro diz a despesa de cada unidade e de cada categoria, e as chaves da receita dizem que são receita', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const { dinheiro } = await import('@/lib/copilot/ferramentas/comum')
    const r = await indicadores.executar(contexto(ctx()), { aba: 'financeiro', periodo: 'today' })
    const d = r.dados as Record<string, unknown>
    expect(d.despesaPorUnidade).toEqual([
      { unidade: BOSQUE.name, valor: dinheiro(174.42) },
      { unidade: CENTRO.name, valor: dinheiro(60) },
    ])
    expect(d.despesaPorCategoria).toEqual([
      { categoria: 'Fornecedores', valor: dinheiro(174.42) },
      { categoria: 'Material de consumo (limpeza, copa)', valor: dinheiro(60) },
    ])
    expect(d.despesas).toBe(dinheiro(234.42))
    // A receita continua, com o nome dela; nenhuma chave neutra que se leia como despesa.
    expect(d.receitaPorUnidade).toEqual([
      { unidade: BOSQUE.name, atual: dinheiro(950), anterior: dinheiro(0) },
      { unidade: CENTRO.name, atual: dinheiro(150), anterior: dinheiro(0) },
    ])
    expect(d.receitaPorCategoria).toEqual([{ categoria: 'Serviços', valor: dinheiro(1100) }])
    expect(d.receitaPorFormaDePagamento).toBeDefined()
    expect(d).not.toHaveProperty('porUnidade')
    expect(d).not.toHaveProperty('porCategoria')
    expect(d).not.toHaveProperty('porFormaDePagamento')
    // Nenhum campo de despesa com o número da receita (o caso da rodada).
    expect(JSON.stringify(d.despesaPorUnidade)).not.toContain(dinheiro(950))
  })

  // Sem o "só os meus" (SM1/SM5, o Heitor, 2026-11-23): o Financeiro em Ver vê a despesa da rede toda.
  it('com o financeiro em Ver, a despesa vai', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const { dinheiro } = await import('@/lib/copilot/ferramentas/comum')
    const r = await indicadores.executar(contexto(ctx({ financial: 'VIEW' })), { aba: 'financeiro', periodo: 'today' })
    const d = r.dados as Record<string, unknown>
    expect(d.despesas).toBe(dinheiro(234.42))
    expect(d).toHaveProperty('despesaPorUnidade')
    expect(d).toHaveProperty('despesaPorCategoria')
  })

  it('as descrições dizem onde mora a despesa por unidade e por categoria', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const { lancamentos } = await import('@/lib/copilot/ferramentas/gestao')
    expect(indicadores.descricao).toMatch(/despesa paga por unidade e por categoria/)
    expect(lancamentos.descricao).toContain('despesaPorUnidade')
  })
})

describe('A41: o Copilot cita a métrica que existe, com o nome dela, e não divide', () => {
  it('a aba agenda traz a taxa de conclusão (fim do período) e o aproveitamento (até agora), cada um com o que conta', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const r = await indicadores.executar(contexto(ctx({ agenda: 'VIEW' })), { aba: 'agenda', periodo: 'month' })
    const d = r.dados as Record<string, unknown>
    expect(d.taxaDeConclusao).toEqual({ valor: '27,3%', oQueConta: DEFINICOES.conclusao.texto })
    expect(d.aproveitamento).toEqual({ valor: '100,0%', oQueConta: DEFINICOES.aproveitamento.texto })
    expect(String(d.comparecimento)).toMatch(/primeiros atendimentos.*comercial/i)
    // Por unidade: a conclusão da tabela dos Relatórios (2 de 6, 1 de 5) e o aproveitamento do dashboard.
    expect(d.porUnidade).toEqual([
      expect.objectContaining({ unidade: BOSQUE.name, taxaDeConclusao: '33,3%', aproveitamento: '100,0%' }),
      expect.objectContaining({ unidade: CENTRO.name, taxaDeConclusao: '20,0%', aproveitamento: '100,0%' }),
    ])
  })

  it('a visão geral traz o aproveitamento com o nome (os números dela são até agora)', async () => {
    const { indicadores } = await import('@/lib/copilot/ferramentas/indicadores')
    const r = await indicadores.executar(contexto(ctx({ agenda: 'VIEW' })), { aba: 'overview', periodo: 'month' })
    expect((r.dados as Record<string, unknown>).aproveitamento).toEqual({ valor: '100,0%', oQueConta: DEFINICOES.aproveitamento.texto })
  })

  it('o prompt manda citar a taxa pelo nome e nunca calcular uma', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const t = instrucoesDoCopilot(ctx(), { rede: 'Ipê', unidade: null, pagina: '/admin/dashboard', slugDoPortal: null, fuso: 'America/Rio_Branco' } as Parameters<typeof instrucoesDoCopilot>[1])
    expect(t).toMatch(/Nunca calcule uma taxa/)
    expect(t).toMatch(/taxa de conclusão/)
    expect(t).toMatch(/aproveitamento/)
    expect(t).toMatch(/despesaPorUnidade/)
  })
})

describe('A40: a categoria que a pessoa não disse vem sugerida, e se troca no cartão', () => {
  it('sem a pessoa dizer, o cartão mostra a categoria como sugerida e oferece todas, a sugerida primeiro', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const { CATEGORIAS_DE_DESPESA } = await import('@/lib/financeiro/categorias')
    const r = await lancar.preparar(contexto(ctx()), { tipo: 'despesa', descricao: 'Lavanderia', valor: 90, categoria: 'Fornecedores', pago: true, forma: 'pix', unidade: 'Bosque' })
    if ('erro' in r) throw new Error(r.erro)
    expect(r.resumo.escolhaEmLista).toEqual({ rotulo: 'Categoria (sugerida)' })
    expect(r.resumo.escolhas?.map(e => e.rotulo)).toEqual(['Fornecedores', ...CATEGORIAS_DE_DESPESA.filter(c => c !== 'Fornecedores')])
    expect(r.resumo.linhas.find(l => l.rotulo === 'Categoria')).toBeUndefined()
    expect(r.resumo.aviso).toMatch(/categoria foi sugerida/i)
  })

  it('a categoria escolhida no cartão é a que se grava', async () => {
    const lancarCore = vi.fn(async () => ({ id: 'tx-1' }))
    vi.doMock('@/lib/financeiro/lancamento', async orig => ({ ...(await orig<typeof import('@/lib/financeiro/lancamento')>()), lancarCore }))
    vi.doMock('next/cache', () => ({ revalidatePath: () => {} }))
    vi.resetModules()
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await lancar.preparar(contexto(ctx()), { tipo: 'despesa', descricao: 'Lavanderia', valor: 90, categoria: 'Fornecedores', pago: true, forma: 'pix', unidade: 'Bosque' })
    if ('erro' in r) throw new Error(r.erro)
    const outro = r.resumo.escolhas!.find(e => e.rotulo === 'Outro')!
    const feito = await lancar.efetivar(contexto(ctx()), r.payload, outro.chave)
    expect(feito).not.toHaveProperty('erro')
    expect(lancarCore).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ categoria: 'Outro' }))
    // Uma chave que não é categoria de despesa não vira categoria.
    expect(await lancar.efetivar(contexto(ctx()), r.payload, 'categoria:Atendimento')).toHaveProperty('erro')
    vi.doUnmock('@/lib/financeiro/lancamento')
    vi.doUnmock('next/cache')
    vi.resetModules()
  })

  it('quando a pessoa disse a categoria, o cartão é o de sempre (Confirmar)', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await lancar.preparar(contexto(ctx()), { tipo: 'despesa', descricao: 'Lavanderia', valor: 90, categoria: 'Outro', categoriaDaPessoa: true, pago: true, forma: 'pix', unidade: 'Bosque' })
    if ('erro' in r) throw new Error(r.erro)
    expect(r.resumo.escolhas).toBeUndefined()
    expect(r.resumo.linhas).toContainEqual({ rotulo: 'Categoria', valor: 'Outro' })
  })

  it('o cartão desenha as escolhas em lista com um Confirmar, e a descrição manda dizer quem escolheu', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(lancar.descricao).toContain('categoriaDaPessoa')
    const cartao = fonte('components/copilot/cartao-do-copilot.tsx')
    expect(cartao).toContain('escolhaEmLista')
    expect(cartao).toContain('data-escolha-em-lista')
  })
})
