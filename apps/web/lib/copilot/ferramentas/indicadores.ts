import 'server-only'
import { z } from 'zod/v4'
import { REPORT_TABS, type ReportTab } from '@estetica-os/types'
import { alcancaUnidade, can, podeVerRelatorio } from '@/lib/auth'
import { unidadesParaLer } from '@/lib/unidades/da-tela'
import { resolvePeriod } from '@/lib/metrics/period'
import { getTicketMedio, getResultadoDoEstoque, getEmAberto, getByBranch, getComposicaoFinanceira } from '@/lib/metrics/queries'
import { DEFINICOES } from '@/lib/metrics/definicoes'
import { painelComercial } from '@/lib/metrics/painel-comercial'
import { getRelatorioDosModulos, getCoreDosModulos } from '@/lib/metrics/dos-modulos'
import { getResumoDeVendas, getVendas, descricaoDaVenda, ROTULO_DO_TIPO } from '@/lib/metrics/vendas'
import { comandaDaVenda, FORA_DO_TOTAL, type Venda } from '@/lib/metrics/vendas-comum'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { fusoDoRecorte } from '@/lib/unidades/fuso-da-unidade'
import { DATA, dinheiro, idsDasUnidades, nomesPorId, procedimentosDaUnidade, resolverUnidade } from '@/lib/copilot/ferramentas/comum'
import { resultadoDoPeriodo, taxaDeConclusao, taxaDeAproveitamento } from '@/lib/metrics/resultado'

/**
 * PROCEDIMENTOS (o catálogo) e INDICADORES.
 *
 * Todo número vem de `lib/metrics` (§13.1) — a ferramenta só escolhe o que
 * mostrar. A aba de relatório segue a permissão (`podeVerRelatorio`), e as
 * unidades são as da abrangência da pessoa. Sem recorte por dono: o Copilot
 * fala pelos módulos da pessoa, não é a vista pessoal dos dashboards.
 */

/** Sem recorte por dono: a agenda e o dinheiro de todos, na abrangência. */
const SEM_RECORTE = { agenda: null, financeiro: null }


/** Uma venda como vai ao modelo: com a comanda do PDV ("Nº 12"), como a lista dos Relatórios (CP1). */
export function vendaParaOModelo(v: Venda) {
  return { data: v.data, comanda: comandaDaVenda(v), tipo: ROTULO_DO_TIPO[v.tipo], descricao: descricaoDaVenda(v), cliente: v.cliente, profissional: v.profissional, valor: dinheiro(v.valor) }
}

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

/** A taxa de `lib/metrics` como a tela a mostra ("27,3%"); sem denominador, nula. */
const emPct = (v: number | null) => v === null ? null : `${v.toFixed(1).replace('.', ',')}%`

const PERIODOS = ['today', 'week', '7d', '15d', '30d', 'month', 'last_month', 'quarter', 'custom'] as const

export const indicadores: FerramentaDeLeitura<{
  aba?: ReportTab; periodo?: (typeof PERIODOS)[number]; de?: string; ate?: string; unidade?: string
}> = {
  nome: 'indicadores',
  tipo: 'leitura',
  modulo: 'reports', nivel: 'VIEW',
  descricao: 'Os números da rede num período (os mesmos dos Relatórios). aba: overview (faturamento, a receber, despesas, atendimentos e o aproveitamento, novos clientes — só na rede inteira, nula numa unidade —, comissões), financeiro (a receita paga por unidade, por forma de pagamento e por categoria — receitaPorUnidade, receitaPorFormaDePagamento, receitaPorCategoria — e a despesa paga por unidade e por categoria — despesaPorUnidade, despesaPorCategoria —, com os totais), vendas (cada venda, com o número da comanda do PDV: atendimento avulso, pacote, pré-pago, plano, produto e crédito interno — o crédito interno fica fora do total —, com o total por tipo), agenda (por status, dia da semana, origem, a taxa de conclusão e o aproveitamento, cada um com o que conta; o comparecimento é o dos primeiros atendimentos, na aba comercial), clientes (ativos, perfil, quem mais gasta), procedimentos, profissionais, estoque, comercial (a aba Oportunidades: o funil, a conversão, os motivos de perda e a conversão por origem). periodo: today, week, 7d, 15d, 30d, month (padrão), last_month, quarter, ou custom com de/ate. "A semana" sem outra data é week (a semana atual) e "o mês" é month: não pergunte qual; a resposta diz o período ("periodo").',
  parametros: z.object({
    aba: z.enum(REPORT_TABS).optional(),
    periodo: z.enum(PERIODOS).optional(),
    de: DATA.optional(), ate: DATA.optional(),
    unidade: z.string().max(80).optional(),
  }),
  async executar(c, args) {
    const aba = args.aba ?? 'overview'
    if (!podeVerRelatorio(c.ctx, aba)) {
      return { dados: { erro: `A sua permissão não abre a aba "${aba}" dos relatórios. Abas liberadas: ${c.ctx.reportTabs.join(', ') || 'nenhuma'}.` } }
    }
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    // O período no fuso do recorte (F62b), como o dashboard e os Relatórios.
    const fuso = await fusoDoRecorte(c.ctx.tenantId, await idsDasUnidades(c, u.unidade))
    const periodo = args.periodo === 'custom' || (args.de && args.ate)
      ? resolvePeriod('custom', args.de, args.ate, new Date(), fuso)
      : resolvePeriod(args.periodo ?? 'month', undefined, undefined, new Date(), fuso)
    // As unidades da LEITURA (C45/F72; IND-01 da varredura de 18/11): sem uma
    // escolhida, as que as telas somam — a desativada que teve movimento no
    // período conta —, e só as que ela alcança. Eram só as ativas.
    const daLeitura = u.unidade ? [] : (await unidadesParaLer(c.ctx.tenantId!, { periodo: { de: periodo.from, ate: periodo.fullTo } }))
      .filter(x => alcancaUnidade(c.ctx, x.id)).map(x => x.id)
    const branchIds = daLeitura.length ? daLeitura : await idsDasUnidades(c, u.unidade)
    // Como o dashboard e os Relatórios: até AGORA, contra o anterior equivalente.
    const recorte = SEM_RECORTE
    const janela = { tenantId: c.ctx.tenantId!, branchIds, from: periodo.from, to: periodo.to }
    const cabecalho = { periodo: periodo.label, unidade: u.unidade?.name ?? 'todas as unidades' }

    if (aba === 'overview') {
      const [atual, anterior, ticket, estoque, emAberto] = await Promise.all([
        getCoreDosModulos({ ...janela, recorte }),
        getCoreDosModulos({ ...janela, from: periodo.prevFrom, to: periodo.prevTo, recorte }),
        getTicketMedio(janela),
        // O lucro, como nas telas: desconta o insumo consumido; a compra de
        // estoque fica nas despesas (o caixa).
        getResultadoDoEstoque(janela),
        // C5 (F68): o "A receber" do Financeiro — pelo VENCIMENTO, até o FIM do
        // período (getEmAberto). Era o pendente do núcleo até agora, outro número.
        getEmAberto({ ...janela, to: periodo.fullTo }),
      ])
      const resultado = resultadoDoPeriodo({ ...atual, ...estoque.total })
      const comissoes = can(c.ctx, 'financial', 'VIEW')
      return {
        dados: {
          ...cabecalho,
          faturamento: dinheiro(atual.revenueCash), faturamentoAnterior: dinheiro(anterior.revenueCash),
          aReceber: dinheiro(emAberto.aReceber),
          notaDoAReceber: 'O que vence no período, até o fim dele, e ainda não foi pago (o "A receber" do Financeiro).',
          despesas: dinheiro(atual.expensesCash),
          insumoConsumido: dinheiro(resultado.insumoConsumido),
          taxasDaMaquininha: dinheiro(resultado.taxasDaMaquininha),
          comissoesLancadas: dinheiro(resultado.comissoes),
          lucro: dinheiro(resultado.lucro),
          margem: resultado.margemPct === null ? null : `${resultado.margemPct.toFixed(1).replace('.', ',')}%`,
          notaDoLucro: 'Lucro = receita paga − despesas pagas (sem a compra de estoque e sem o pagamento das comissões, que ficam no caixa) − insumo consumido e custo do produto vendido − taxas da maquininha − comissões lançadas no período.',
          receitaDeServicos: dinheiro(atual.serviceRevenue),
          atendimentosConcluidos: atual.appointmentsCompleted, atendimentosConcluidosAnterior: anterior.appointmentsCompleted,
          agendamentos: atual.appointmentsTotal, cancelados: atual.appointmentsCancelled, faltas: atual.appointmentsNoShow,
          // A41 da 24ª [4]: a taxa vai pronta, com o nome e o que conta — o Copilot não divide.
          aproveitamento: { valor: emPct(taxaDeAproveitamento({ concluidos: atual.appointmentsCompleted, total: atual.appointmentsTotal })), oQueConta: DEFINICOES.aproveitamento.texto },
          // A média por CLIENTE (o pago pelas clientes ÷ as que pagaram), como as telas.
          ticketMedio: ticket.total.valor === null ? null : dinheiro(ticket.total.valor),
          clientesQuePagaram: ticket.total.clientesQuePagaram,
          novosClientes: atual.newClients, novosClientesAnterior: anterior.newClients,
          // IND-09 (varredura de 18/11): o nulo vai com o porquê, como a tela diz.
          ...(atual.newClients === null ? { notaDosNovosClientes: '"Novos clientes" só existe na rede inteira: a cliente é da rede, e nenhuma unidade tem clientes novas só dela.' } : {}),
          ...(comissoes ? { comissoesEmAberto: dinheiro(atual.commissionsOpen), comissoesPagas: dinheiro(atual.commissionsPaid) } : {}),
          nota: 'O período anterior é o equivalente (mesmo tamanho), não o mês inteiro.',
        },
      }
    }

    if (aba === 'comercial') {
      // C5 (F68): o MESMO painel da aba Comercial dos Relatórios — o funil do
      // funil padrão, a conversão somando os funis ATIVOS, o comparecimento, os
      // motivos de perda e a conversão por origem, até o FIM do período. Era só
      // o funil padrão, até agora.
      const p = await painelComercial({ tenantId: c.ctx.tenantId!, branchIds, from: periodo.from, to: periodo.fullTo })
      const pct = (v: number | null) => v === null ? null : `${v.toFixed(1).replace('.', ',')}%`
      return {
        dados: {
          ...cabecalho,
          funil: { nome: p.funis.find(f => f.id === p.funilAtivo)?.name ?? null, etapas: p.etapas.map(e => ({ etapa: e.name, oportunidades: e.count })) },
          oportunidades: p.totalLeads, ganhas: p.ganhos, conversao: pct(p.conversao),
          primeirosAtendimentos: { agendados: p.comerciaisAgendados, realizados: p.comerciaisRealizados, comparecimento: p.comparecimento === null ? 'nenhum que já devia ter acontecido' : `${Math.round(p.comparecimento)}%` },
          motivosDePerda: p.motivosDePerda,
          conversaoPorOrigem: p.conversaoPorOrigem.map(o => ({ ...o, conversaoPct: pct(o.conversaoPct) })),
          porResponsavel: p.ranking.slice(0, 15).map(r => ({ nome: r.name, oportunidades: r.leads, ganhas: r.ganhos, conversao: pct(r.conversaoPct), agendamentos: r.agendamentos })),
          nota: p.temGanho
            ? 'Conversão = oportunidades na etapa de ganho ÷ oportunidades, somando os funis ativos (não importa se a pessoa já é cliente). As etapas são as do funil padrão.'
            : 'Nenhum funil ativo tem etapa de ganho: não há conversão.',
        },
      }
    }

    if (aba === 'vendas') {
      // A lista fecha no FIM do período, como na tela; o total vem do banco.
      const vendas = { ...janela, to: periodo.fullTo }
      const [resumo, ultimas] = await Promise.all([getResumoDeVendas(vendas), getVendas({ ...vendas, limite: 30 })])
      return {
        dados: {
          ...cabecalho,
          total: dinheiro(resumo.geral.total), vendas: resumo.geral.quantidade,
          porTipo: Object.entries(resumo.porTipo).map(([tipo, x]) => ({ tipo: ROTULO_DO_TIPO[tipo as keyof typeof ROTULO_DO_TIPO], vendas: x.quantidade, total: dinheiro(x.total) })),
          ultimas: ultimas.map(vendaParaOModelo),
          ...(resumo.porTipo.CREDITO?.quantidade ? { foraDoTotal: `${FORA_DO_TOTAL.map(t => ROTULO_DO_TIPO[t]).join(', ')}: entra na lista e não no total vendido (é dinheiro guardado, que vira atendimento depois).` } : {}),
          nota: resumo.geral.quantidade > ultimas.length ? 'A lista traz as 30 mais recentes; a completa está em Relatórios → Vendas.' : undefined,
        },
      }
    }

    const noRecorte = new Set(branchIds)
    const [r, ticket, totais, porUnidadeAteAgora, composicao, agendaAteOFim] = await Promise.all([
      // A agenda vai até o FIM do período, como a aba Agenda dos Relatórios (C5, F68).
      getRelatorioDosModulos({ ...janela, to: aba === 'agenda' ? periodo.fullTo : periodo.to, prevFrom: periodo.prevFrom, prevTo: periodo.prevTo, aba, granularidade: periodo.granularity === 'hour' ? 'hour' : 'day', recorte }),
      aba === 'clientes' ? getTicketMedio(janela) : Promise.resolve(null),
      // D1 da 24ª [3]: a receita e a despesa do período (a conta do núcleo, a do
      // Financeiro) e, por unidade, a de `getByBranch` — o "Por unidade" do
      // Financeiro da rede. Na agenda, o mesmo núcleo dá o aproveitamento (até agora).
      aba === 'financeiro' || aba === 'agenda' ? getCoreDosModulos({ ...janela, recorte }) : Promise.resolve(null),
      aba === 'financeiro' || aba === 'agenda'
        ? getByBranch({ tenantId: c.ctx.tenantId!, from: periodo.from, to: periodo.to }).then(l => l.filter(b => noRecorte.has(b.branchId)))
        : Promise.resolve(null),
      // A despesa por categoria: a composição do Financeiro (sem o estorno, F59).
      aba === 'financeiro' ? getComposicaoFinanceira({ tenantId: c.ctx.tenantId!, branchIds, from: periodo.from, to: periodo.to }) : Promise.resolve(null),
      // A41 da 24ª [4]: a taxa de conclusão é a dos Relatórios, até o FIM do período.
      aba === 'agenda' ? getCoreDosModulos({ ...janela, to: periodo.fullTo, recorte }) : Promise.resolve(null),
    ])
    const nomesDasUnidades = await nomesPorId(c, 'branches', [...r.receitaPorUnidade.map(x => x.branchId), ...r.agendaPorUnidade.map(x => x.branchId), ...r.estoque.porUnidade.map(x => x.branchId)])
    const unidade = (id: string) => nomesDasUnidades.get(id) ?? id
    const top = <T>(l: T[], n = 15) => l.slice(0, n)
    const aproveitamentoDe = new Map((porUnidadeAteAgora ?? []).map(b =>
      [b.branchId, emPct(taxaDeAproveitamento({ concluidos: b.appointmentsCompleted, total: b.appointmentsTotal }))]))

    const porAba: Record<Exclude<ReportTab, 'overview' | 'comercial' | 'vendas'>, unknown> = {
      // D1 da 24ª [3]: cada chave diz se é receita ou despesa — "porUnidade" era a
      // receita, e o Copilot a deu como a despesa de cada unidade.
      financeiro: {
        ...(totais ? { receita: dinheiro(totais.revenueCash) } : {}),
        receitaPorUnidade: r.receitaPorUnidade.map(x => ({ unidade: unidade(x.branchId), atual: dinheiro(x.atual), anterior: dinheiro(x.anterior) })),
        receitaPorFormaDePagamento: r.receitaPorForma.map(x => ({ forma: x.forma, valor: dinheiro(x.valor) })),
        receitaPorCategoria: r.receitaPorCategoria.map(x => ({ categoria: x.categoria, valor: dinheiro(x.valor) })),
        ...(!totais ? {} : {
          despesas: dinheiro(totais.expensesCash),
          despesaPorUnidade: (porUnidadeAteAgora ?? []).map(b => ({ unidade: unidade(b.branchId), valor: dinheiro(b.expensesCash) })),
          despesaPorCategoria: (composicao?.despesas ?? []).map(x => ({ categoria: x.chave, valor: dinheiro(x.valor) })),
          notaDaDespesa: 'A despesa paga no período, pelo dia do pagamento: a mesma do Financeiro. O estorno não é despesa.',
        }),
      },
      // A41 da 24ª [4]: as taxas vão prontas, com o nome e o que contam — o
      // Copilot não divide os números da agenda (os futuros entravam).
      agenda: {
        porStatus: r.agendamentosPorStatus, porDiaDaSemana: r.porDiaDaSemana, porOrigem: r.porOrigem,
        ...(agendaAteOFim ? { taxaDeConclusao: { valor: emPct(taxaDeConclusao({ concluidos: agendaAteOFim.appointmentsCompleted, total: agendaAteOFim.appointmentsTotal })), oQueConta: DEFINICOES.conclusao.texto } } : {}),
        ...(totais ? { aproveitamento: { valor: emPct(taxaDeAproveitamento({ concluidos: totais.appointmentsCompleted, total: totais.appointmentsTotal })), oQueConta: DEFINICOES.aproveitamento.texto } } : {}),
        comparecimento: 'O comparecimento do sistema é o dos primeiros atendimentos do comercial (aba comercial, "primeirosAtendimentos"): só o que já devia ter acontecido.',
        porUnidade: r.agendaPorUnidade.map(x => ({
          ...x, unidade: unidade(x.branchId), branchId: undefined,
          taxaDeConclusao: emPct(taxaDeConclusao({ concluidos: x.concluidos, total: x.total })),
          ...(aproveitamentoDe.has(x.branchId) ? { aproveitamento: aproveitamentoDe.get(x.branchId) } : {}),
        })),
        nota: 'Use as taxas com o nome delas; não calcule outra com estes números.',
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
        valorEmEstoque: dinheiro(r.estoque.valorEmEstoque), itensCriticos: r.estoque.criticos, zerados: r.estoque.zerados,
        consumoNoPeriodo: dinheiro(r.consumoTotal),
        maisConsumidos: top(r.estoque.maisConsumidos, 10).map(x => ({ ...x, valor: dinheiro(x.valor) })),
      },
    }
    return { dados: { ...cabecalho, aba, ...(porAba[aba] as object) } }
  },
}
