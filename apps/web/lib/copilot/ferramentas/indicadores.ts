import 'server-only'
import { z } from 'zod/v4'
import { REPORT_TABS, type ReportTab } from '@estetica-os/types'
import { can, isOwnScope, podeVerRelatorio } from '@/lib/auth'
import { resolvePeriod } from '@/lib/metrics/period'
import { getLeadFunnel, getTicketMedio, getResultadoDoEstoque } from '@/lib/metrics/queries'
import { getRelatorioDosModulos, getCoreDosModulos } from '@/lib/metrics/dos-modulos'
import { recorteDosModulos } from '@/lib/metrics/escopo'
import { getResumoDeVendas, getVendas, descricaoDaVenda, ROTULO_DO_TIPO } from '@/lib/metrics/vendas'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { DATA, dinheiro, idsDasUnidades, nomesPorId, procedimentosDaUnidade, resolverUnidade } from '@/lib/copilot/ferramentas/comum'
import { resumoDoFunil, resultadoDoPeriodo } from '@/lib/metrics/resultado'

/**
 * PROCEDIMENTOS (o catálogo) e INDICADORES.
 *
 * Todo número vem de `lib/metrics` (§13.1) — a ferramenta só escolhe o que
 * mostrar. A aba de relatório segue a do cargo (`podeVerRelatorio`), e o
 * escopo "só a minha unidade" dos relatórios obriga a escolher uma unidade.
 *
 * "Só os meus" (decisão do Heitor, 2026-10-28: "quem tem 'só os meus' vê 'só
 * os meus', em qualquer lugar"), com CADA número no escopo do seu módulo
 * (2026-10-29, lib/metrics/escopo): a agenda e as clientes pelo da agenda, o
 * dinheiro pelo do financeiro, o funil pelo do CRM (os leads dela e os sem
 * dono). O que não se atribui a ela com o financeiro OWN (a despesa, o saldo
 * e o valor do estoque, a comissão das outras) não vai ao modelo.
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
    // Os que a unidade OFERECE (disponibilidade por unidade incluída).
    const linhas = (await procedimentosDaUnidade(c, u.unidade?.id ?? c.ctx.branchId, args.busca)).slice(0, 150)
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
  descricao: 'Os números da clínica num período (os mesmos dos Relatórios). aba: overview (faturamento, a receber, despesas, atendimentos, novos clientes, comissões), financeiro (por unidade, forma de pagamento, categoria), vendas (cada venda: procedimento, pacote, pré-pago e plano, com o total por tipo), agenda (por status, dia da semana, origem), clientes (ativos, perfil, quem mais gasta), procedimentos, profissionais, estoque, comercial (funil). periodo: today, week, 7d, 15d, 30d, month (padrão), last_month, quarter, ou custom com de/ate.',
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
    // Cada número no escopo do SEU módulo (2026-10-29, lib/metrics/escopo): a
    // agenda e as clientes pela agenda, o dinheiro pelo financeiro, o funil
    // pelo CRM. O que não se atribui a ela com o FINANCEIRO "só os meus" (a
    // despesa, o saldo e o valor do estoque) não vai ao modelo.
    const recorte = recorteDosModulos(c.ctx)
    const recorteProprio = recorte.financeiro !== null
    const janela = { tenantId: c.ctx.tenantId!, branchIds, from: periodo.from, to: periodo.to }
    const doDinheiro = { ...janela, professionalId: recorte.financeiro }
    const partes = [
      recorte.agenda ? 'só os seus atendimentos e as suas clientes' : null,
      recorte.financeiro ? 'só o dinheiro dos seus atendimentos' : null,
    ].filter(Boolean)
    const cabecalho = {
      periodo: periodo.label, unidade: u.unidade?.name ?? 'todas as unidades',
      ...(partes.length ? { recorte: `${partes.join('; ')} (o seu cargo vê "só os meus" nesse módulo)` } : {}),
    }

    if (aba === 'overview') {
      const [atual, anterior, ticket, estoque] = await Promise.all([
        getCoreDosModulos({ ...janela, recorte }),
        getCoreDosModulos({ ...janela, from: periodo.prevFrom, to: periodo.prevTo, recorte }),
        getTicketMedio(doDinheiro),
        // O lucro, como nas telas: desconta o insumo consumido; a compra de
        // estoque fica nas despesas (o caixa). Não se atribui a ela com o financeiro OWN.
        recorteProprio ? Promise.resolve(null) : getResultadoDoEstoque(janela),
      ])
      const resultado = estoque ? resultadoDoPeriodo({ ...atual, ...estoque.total }) : null
      // Com o financeiro "só os meus", a comissão do núcleo já é a DELA.
      const comissoes = can(c.ctx, 'financial', 'VIEW')
      return {
        dados: {
          ...cabecalho,
          faturamento: dinheiro(atual.revenueCash), faturamentoAnterior: dinheiro(anterior.revenueCash),
          aReceber: dinheiro(atual.revenuePending),
          // A despesa não se atribui a ela (o dashboard esconde o custo).
          ...(recorteProprio || !resultado ? {} : {
            despesas: dinheiro(atual.expensesCash),
            insumoConsumido: dinheiro(resultado.insumoConsumido),
            lucro: dinheiro(resultado.lucro),
            margem: resultado.margemPct === null ? null : `${resultado.margemPct.toFixed(1).replace('.', ',')}%`,
            notaDoLucro: 'Lucro = receita paga − despesas pagas (sem a compra de estoque, que fica no caixa) − insumo consumido e custo do produto vendido.',
          }),
          receitaDeServicos: dinheiro(atual.serviceRevenue),
          atendimentosConcluidos: atual.appointmentsCompleted, atendimentosConcluidosAnterior: anterior.appointmentsCompleted,
          agendamentos: atual.appointmentsTotal, cancelados: atual.appointmentsCancelled, faltas: atual.appointmentsNoShow,
          // A média por CLIENTE (o pago pelas clientes ÷ as que pagaram), como as telas.
          ticketMedio: ticket.total.valor === null ? null : dinheiro(ticket.total.valor),
          clientesQuePagaram: ticket.total.clientesQuePagaram,
          novosClientes: atual.newClients, novosClientesAnterior: anterior.newClients,
          ...(comissoes ? { comissoesEmAberto: dinheiro(atual.commissionsOpen), comissoesPagas: dinheiro(atual.commissionsPaid) } : {}),
          nota: 'O período anterior é o equivalente (mesmo tamanho), não o mês inteiro.',
        },
      }
    }

    if (aba === 'comercial') {
      // CRM "só os meus": os leads dela e os sem dono, o recorte do quadro.
      const funil = await getLeadFunnel({ ...janela, ownerId: recorte.crm })
      // A conversão é da OPORTUNIDADE (ganhas ÷ do funil), a conta das telas.
      const resumo = resumoDoFunil(funil)
      return {
        dados: {
          ...cabecalho,
          funil: funil.map(e => ({ etapa: e.name, desfecho: e.outcome, oportunidades: e.leads, jaSaoClientes: e.converted })),
          oportunidades: resumo.total, ganhas: resumo.ganhos,
          conversao: resumo.conversaoPct === null ? null : `${resumo.conversaoPct.toFixed(1).replace('.', ',')}%`,
          nota: resumo.temGanho
            ? 'Conversão = oportunidades na etapa de ganho ÷ oportunidades do funil (não importa se a pessoa já é cliente).'
            : 'O funil não tem etapa de ganho: não há conversão.',
        },
      }
    }

    if (aba === 'vendas') {
      // A lista fecha no FIM do período, como na tela; o total vem do banco.
      // A venda é dinheiro: segue o financeiro.
      const vendas = { ...doDinheiro, to: periodo.fullTo }
      const [resumo, ultimas] = await Promise.all([getResumoDeVendas(vendas), getVendas({ ...vendas, limite: 30 })])
      return {
        dados: {
          ...cabecalho,
          total: dinheiro(resumo.geral.total), vendas: resumo.geral.quantidade,
          porTipo: Object.entries(resumo.porTipo).map(([tipo, x]) => ({ tipo: ROTULO_DO_TIPO[tipo as keyof typeof ROTULO_DO_TIPO], vendas: x.quantidade, total: dinheiro(x.total) })),
          ultimas: ultimas.map(v => ({ data: v.data, tipo: ROTULO_DO_TIPO[v.tipo], descricao: descricaoDaVenda(v), cliente: v.cliente, profissional: v.profissional, valor: dinheiro(v.valor) })),
          nota: resumo.geral.quantidade > ultimas.length ? 'A lista traz as 30 mais recentes; a completa está em Relatórios → Vendas.' : undefined,
        },
      }
    }

    const [r, ticket] = await Promise.all([
      getRelatorioDosModulos({ ...janela, prevFrom: periodo.prevFrom, prevTo: periodo.prevTo, aba, granularidade: periodo.granularity === 'hour' ? 'hour' : 'day', recorte }),
      aba === 'clientes' ? getTicketMedio(doDinheiro) : Promise.resolve(null),
    ])
    const nomesDasUnidades = await nomesPorId(c, 'branches', [...r.receitaPorUnidade.map(x => x.branchId), ...r.agendaPorUnidade.map(x => x.branchId), ...r.estoque.porUnidade.map(x => x.branchId)])
    const unidade = (id: string) => nomesDasUnidades.get(id) ?? id
    const top = <T>(l: T[], n = 15) => l.slice(0, n)

    const porAba: Record<Exclude<ReportTab, 'overview' | 'comercial' | 'vendas'>, unknown> = {
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
        cidades: top(r.clientes.cidades, 10),
        // O ticket médio (era o "gasto médio"): o pago pelas clientes ÷ as que pagaram.
        ticketMedio: ticket?.total.valor == null ? null : dinheiro(ticket.total.valor),
        quemMaisGasta: top(r.clientes.topClientes, 10).map(x => ({ ...x, total: dinheiro(x.total) })),
      },
      procedimentos: {
        porProcedimento: top(r.porProcedimento).map(x => ({ ...x, receita: dinheiro(x.receita) })),
        porCategoria: r.receitaPorCategoriaDeProcedimento.map(x => ({ ...x, receita: dinheiro(x.receita) })),
      },
      profissionais: {
        porProfissional: top(r.porProfissional).map(x => ({ ...x, receita: dinheiro(x.receita) })),
        ...(can(c.ctx, 'financial', 'VIEW')
          ? { comissoes: r.comissoesPorProfissional.map(x => ({ ...x, aberta: dinheiro(x.aberta), paga: dinheiro(x.paga) })) }
          : {}),
      },
      estoque: {
        // O saldo e o valor do estoque não se atribuem a ela: com "só os meus",
        // só o insumo dos atendimentos dela.
        ...(recorteProprio ? {} : { valorEmEstoque: dinheiro(r.estoque.valorEmEstoque), itensCriticos: r.estoque.criticos, zerados: r.estoque.zerados }),
        consumoNoPeriodo: dinheiro(r.consumoTotal),
        maisConsumidos: top(r.estoque.maisConsumidos, 10).map(x => ({ ...x, valor: dinheiro(x.valor) })),
      },
    }
    return { dados: { ...cabecalho, aba, ...(porAba[aba] as object) } }
  },
}
