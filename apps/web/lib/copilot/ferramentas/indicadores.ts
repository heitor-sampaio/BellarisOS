import 'server-only'
import { z } from 'zod/v4'
import { REPORT_TABS, type ReportTab } from '@estetica-os/types'
import { can, isOwnScope, podeVerRelatorio } from '@/lib/auth'
import { ler } from '@/lib/db'
import { resolvePeriod } from '@/lib/metrics/period'
import { getCore, getLeadFunnel } from '@/lib/metrics/queries'
import { getRelatorio } from '@/lib/metrics/relatorio'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { DATA, dinheiro, idsDasUnidades, nomesPorId, resolverUnidade } from '@/lib/copilot/ferramentas/comum'

/**
 * PROCEDIMENTOS (o catálogo) e INDICADORES.
 *
 * Todo número vem de `lib/metrics` (§13.1) — a ferramenta só escolhe o que
 * mostrar. A aba de relatório segue a do cargo (`podeVerRelatorio`), e o
 * escopo "só a minha unidade" dos relatórios obriga a escolher uma unidade.
 */

export const procedimentos: FerramentaDeLeitura<{ busca?: string; unidade?: string }> = {
  nome: 'procedimentos',
  tipo: 'leitura',
  pode: ctx => can(ctx, 'procedures', 'VIEW') || can(ctx, 'agenda', 'VIEW'),
  descricao: 'O catálogo de procedimentos ativos: nome, categoria, duração e preço. Filtro opcional por parte do nome e por unidade.',
  parametros: z.object({ busca: z.string().max(60).optional(), unidade: z.string().max(80).optional() }),
  async executar(c, args) {
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    let q = c.admin.from('procedures').select('id, name, category, duration_min, price, branch_id')
      .eq('tenant_id', c.ctx.tenantId!).eq('is_active', true).order('name').limit(150)
    if (u.unidade) q = q.or(`branch_id.is.null,branch_id.eq.${u.unidade.id}`)
    if (args.busca) q = q.ilike('name', `%${args.busca.replace(/[%_\\]/g, '')}%`)
    const linhas = (await ler(q, 'ler os procedimentos') as { id: string; name: string; category: string | null; duration_min: number; price: number }[] | null) ?? []
    return {
      dados: {
        procedimentos: linhas.map(p => ({ id: p.id, nome: p.name, categoria: p.category, duracaoMin: p.duration_min, preco: dinheiro(p.price) })),
      },
    }
  },
}

const PERIODOS = ['today', 'week', '7d', '15d', '30d', 'month', 'last_month', 'quarter', 'custom'] as const

export const indicadores: FerramentaDeLeitura<{
  aba?: ReportTab; periodo?: (typeof PERIODOS)[number]; de?: string; ate?: string; unidade?: string
}> = {
  nome: 'indicadores',
  tipo: 'leitura',
  modulo: 'reports', nivel: 'VIEW',
  descricao: 'Os números da clínica num período (os mesmos dos Relatórios). aba: overview (faturamento, a receber, despesas, atendimentos, novos clientes, comissões), financeiro (por unidade, forma de pagamento, categoria), agenda (por status, dia da semana, origem), clientes (ativos, perfil, quem mais gasta), procedimentos, profissionais, estoque, comercial (funil). periodo: today, week, 7d, 15d, 30d, month (padrão), last_month, quarter, ou custom com de/ate.',
  parametros: z.object({
    aba: z.enum(REPORT_TABS).optional(),
    periodo: z.enum(PERIODOS).optional(),
    de: DATA.optional(), ate: DATA.optional(),
    unidade: z.string().max(80).optional(),
  }),
  async executar(c, args) {
    const aba = args.aba ?? 'overview'
    if (!podeVerRelatorio(c.ctx, aba)) {
      return { dados: { erro: `O seu cargo não vê a aba "${aba}" dos relatórios. Abas liberadas: ${c.ctx.reportTabs.join(', ') || 'nenhuma'}.` } }
    }
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    // "Só a minha unidade" nos relatórios: uma unidade por vez, nunca a rede somada.
    if (!u.unidade && isOwnScope(c.ctx, 'reports')) {
      const exigida = await resolverUnidade(c, null, { exigir: true })
      return { dados: { erro: 'erro' in exigida ? exigida.erro : 'Escolha uma unidade.' } }
    }
    const branchIds = await idsDasUnidades(c, u.unidade)
    const periodo = args.periodo === 'custom' || (args.de && args.ate)
      ? resolvePeriod('custom', args.de, args.ate)
      : resolvePeriod(args.periodo ?? 'month')
    // Como o dashboard e os Relatórios: até AGORA, contra o anterior equivalente.
    const base = { tenantId: c.ctx.tenantId!, branchIds, from: periodo.from, to: periodo.to }
    const cabecalho = { periodo: periodo.label, unidade: u.unidade?.name ?? 'todas as unidades' }

    if (aba === 'overview') {
      const [atual, anterior] = await Promise.all([
        getCore(base),
        getCore({ ...base, from: periodo.prevFrom, to: periodo.prevTo }),
      ])
      const comissoes = can(c.ctx, 'financial', 'VIEW') && !isOwnScope(c.ctx, 'financial')
      return {
        dados: {
          ...cabecalho,
          faturamento: dinheiro(atual.revenueCash), faturamentoAnterior: dinheiro(anterior.revenueCash),
          aReceber: dinheiro(atual.revenuePending), despesas: dinheiro(atual.expensesCash),
          receitaDeServicos: dinheiro(atual.serviceRevenue),
          atendimentosConcluidos: atual.appointmentsCompleted, atendimentosConcluidosAnterior: anterior.appointmentsCompleted,
          agendamentos: atual.appointmentsTotal, cancelados: atual.appointmentsCancelled, faltas: atual.appointmentsNoShow,
          ticketMedio: atual.appointmentsCompleted ? dinheiro(atual.serviceRevenue / atual.appointmentsCompleted) : null,
          novosClientes: atual.newClients, novosClientesAnterior: anterior.newClients,
          ...(comissoes ? { comissoesEmAberto: dinheiro(atual.commissionsOpen), comissoesPagas: dinheiro(atual.commissionsPaid) } : {}),
          nota: 'O período anterior é o equivalente (mesmo tamanho), não o mês inteiro.',
        },
      }
    }

    if (aba === 'comercial') {
      const funil = await getLeadFunnel(base)
      return { dados: { ...cabecalho, funil: funil.map(e => ({ etapa: e.name, desfecho: e.outcome, oportunidades: e.leads, convertidas: e.converted })) } }
    }

    const r = await getRelatorio({ ...base, prevFrom: periodo.prevFrom, prevTo: periodo.prevTo, aba, granularidade: periodo.granularity === 'hour' ? 'hour' : 'day' })
    const nomesDasUnidades = await nomesPorId(c, 'branches', [...r.receitaPorUnidade.map(x => x.branchId), ...r.agendaPorUnidade.map(x => x.branchId), ...r.estoque.porUnidade.map(x => x.branchId)])
    const unidade = (id: string) => nomesDasUnidades.get(id) ?? id
    const top = <T>(l: T[], n = 15) => l.slice(0, n)

    const porAba: Record<Exclude<ReportTab, 'overview' | 'comercial'>, unknown> = {
      financeiro: {
        porUnidade: r.receitaPorUnidade.map(x => ({ unidade: unidade(x.branchId), atual: dinheiro(x.atual), anterior: dinheiro(x.anterior) })),
        porFormaDePagamento: r.receitaPorForma.map(x => ({ forma: x.forma, valor: dinheiro(x.valor) })),
        porCategoria: r.receitaPorCategoria.map(x => ({ categoria: x.categoria, valor: dinheiro(x.valor) })),
      },
      agenda: {
        porStatus: r.agendamentosPorStatus, porDiaDaSemana: r.porDiaDaSemana, porOrigem: r.porOrigem,
        porUnidade: r.agendaPorUnidade.map(x => ({ ...x, unidade: unidade(x.branchId), branchId: undefined })),
      },
      clientes: {
        ativos: r.clientes.totalAtivos, porFaixaDeIdade: r.clientes.porFaixa, porGenero: r.clientes.porGenero,
        cidades: top(r.clientes.cidades, 10), gastoMedio: dinheiro(r.clientes.gastoMedio),
        quemMaisGasta: top(r.clientes.topClientes, 10).map(x => ({ ...x, total: dinheiro(x.total) })),
      },
      procedimentos: {
        porProcedimento: top(r.porProcedimento).map(x => ({ ...x, receita: dinheiro(x.receita) })),
        porCategoria: r.receitaPorCategoriaDeProcedimento.map(x => ({ ...x, receita: dinheiro(x.receita) })),
      },
      profissionais: {
        porProfissional: top(r.porProfissional).map(x => ({ ...x, receita: dinheiro(x.receita) })),
        ...(can(c.ctx, 'financial', 'VIEW') && !isOwnScope(c.ctx, 'financial')
          ? { comissoes: r.comissoesPorProfissional.map(x => ({ ...x, aberta: dinheiro(x.aberta), paga: dinheiro(x.paga) })) }
          : {}),
      },
      estoque: {
        valorEmEstoque: dinheiro(r.estoque.valorEmEstoque), itensCriticos: r.estoque.criticos, zerados: r.estoque.zerados,
        consumoNoPeriodo: dinheiro(r.consumoTotal),
        maisConsumidos: top(r.estoque.maisConsumidos, 10).map(x => ({ ...x, valor: dinheiro(x.valor) })),
      },
    }
    return { dados: { ...cabecalho, aba, ...(porAba[aba] as object) } }
  },
}
