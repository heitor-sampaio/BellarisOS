import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * Os agregados da tela de relatórios, calculados no Postgres
 * (`metrics_relatorio`, migration `20260927000011`) — só os da aba aberta.
 *
 * A tela buscava as linhas do período e fazia umas 40 contas em JS: cortava
 * em 1000 linhas e tinha uma SEGUNDA regra de faturamento (por `created_at`,
 * com estorno) ao lado do KPI (por `paid_at`, sem estorno). Todo dinheiro
 * daqui sai de `metrics_receitas_pagas`, a mesma regra de `metrics_core`.
 */

export type Aba = 'overview' | 'financeiro' | 'agenda' | 'clientes' | 'procedimentos' | 'profissionais' | 'estoque' | 'comercial'

export interface Relatorio {
  receitaPorUnidade:   { branchId: string; atual: number; anterior: number }[]
  receitaPorForma:     { forma: string; valor: number }[]
  receitaPorCategoria: { categoria: string; valor: number }[]
  /** Consumo de insumos no período, ao custo do movimento (= metrics_giro_estoque). */
  consumoTotal:        number
  /** Consumo por hora ('0'…'23') ou por dia ('YYYY-MM-DD'), no fuso da clínica. */
  consumoPorFatia:     Map<string, number>
  porProcedimento:     { nome: string; categoria: string; receita: number; execucoes: number }[]
  porProfissional:     { nome: string; receita: number; atendimentos: number }[]
  /** Receita dos atendimentos por categoria do procedimento (aba Procedimentos). */
  receitaPorCategoriaDeProcedimento: { categoria: string; receita: number }[]
  agendamentosPorStatus: { status: string; n: number }[]
  porDiaDaSemana:      { dia: number; n: number }[]
  porOrigem:           { origem: string; n: number }[]
  agendaPorUnidade:    { branchId: string; total: number; concluidos: number; cancelados: number; faltas: number }[]
  clientes: {
    totalAtivos: number
    porFaixa:    { faixa: string; n: number }[]
    porGenero:   { genero: string; n: number }[]
    cidades:     { cidade: string; n: number }[]
    gastoMedio:  number
    topClientes: { nome: string; total: number; atendimentos: number }[]
  }
  procedimentosPorFaixa: {
    temCustos: boolean
    volume:    { faixa: string; nome: string; n: number }[]
    margem:    { faixa: string; nome: string; margem: number }[]
  }
  comissoesPorProfissional: { nome: string; aberta: number; paga: number }[]
  estoque: {
    valorEmEstoque:    number
    criticos:          number
    zerados:           number
    valorPorCategoria: { categoria: string; valor: number }[]
    porUnidade:        { branchId: string; itens: number; zerados: number; criticos: number; valor: number }[]
    maisConsumidos:    { nome: string; valor: number }[]
  }
}

type Bruto = Record<string, unknown>
const num = (v: unknown) => Number(v ?? 0)
const lista = (v: unknown) => (Array.isArray(v) ? v : []) as Bruto[]

export async function getRelatorio(args: {
  tenantId: string; branchIds: string[]
  from: Date; to: Date; prevFrom: Date; prevTo: Date
  aba: Aba; granularidade: 'hour' | 'day'
}): Promise<Relatorio> {
  const admin = createAdminClient()
  const [data, categorias] = await Promise.all([
    ler(admin.rpc('metrics_relatorio', {
      p_tenant: args.tenantId, p_branch_ids: args.branchIds,
      p_from: args.from.toISOString(), p_to: args.to.toISOString(),
      p_prev_from: args.prevFrom.toISOString(), p_prev_to: args.prevTo.toISOString(),
      p_aba: args.aba, p_granularidade: args.granularidade,
    }), 'calcular os relatórios'),
    args.aba === 'procedimentos'
      ? ler(admin.rpc('metrics_receita_por_categoria_de_procedimento', {
          p_tenant: args.tenantId, p_branch_ids: args.branchIds,
          p_from: args.from.toISOString(), p_to: args.to.toISOString(),
        }), 'calcular a receita por categoria')
      : Promise.resolve([]),
  ])
  const r = (data ?? {}) as Bruto

  return {
    receitaPorUnidade:   lista(r.receita_por_unidade).map(x => ({ branchId: String(x.branch_id), atual: num(x.atual), anterior: num(x.anterior) })),
    receitaPorForma:     lista(r.receita_por_forma).map(x => ({ forma: String(x.forma), valor: num(x.valor) })),
    receitaPorCategoria: lista(r.receita_por_categoria).map(x => ({ categoria: String(x.categoria), valor: num(x.valor) })),
    consumoTotal:        num(r.consumo_total),
    consumoPorFatia:     new Map(lista(r.consumo_por_fatia).map(x => [String(x.chave), num(x.valor)])),
    porProcedimento:     lista(r.por_procedimento).map(x => ({ nome: String(x.nome), categoria: String(x.categoria), receita: num(x.receita), execucoes: num(x.execucoes) })),
    porProfissional:     lista(r.por_profissional).map(x => ({ nome: String(x.nome), receita: num(x.receita), atendimentos: num(x.atendimentos) })),
    receitaPorCategoriaDeProcedimento: lista(categorias).map(x => ({ categoria: String(x.categoria), receita: num(x.receita) })),
    agendamentosPorStatus: lista(r.agendamentos_por_status).map(x => ({ status: String(x.status), n: num(x.n) })),
    porDiaDaSemana:      lista(r.por_dia_da_semana).map(x => ({ dia: num(x.dia), n: num(x.n) })),
    porOrigem:           lista(r.por_origem).map(x => ({ origem: String(x.origem), n: num(x.n) })),
    agendaPorUnidade:    lista(r.agenda_por_unidade).map(x => ({
      branchId: String(x.branch_id), total: num(x.total), concluidos: num(x.concluidos),
      cancelados: num(x.cancelados), faltas: num(x.faltas),
    })),
    clientes: {
      totalAtivos: num(r.total_ativos),
      porFaixa:    lista(r.por_faixa).map(x => ({ faixa: String(x.faixa), n: num(x.n) })),
      porGenero:   lista(r.por_genero).map(x => ({ genero: String(x.genero), n: num(x.n) })),
      cidades:     lista(r.cidades).map(x => ({ cidade: String(x.cidade), n: num(x.n) })),
      gastoMedio:  num(r.gasto_medio),
      topClientes: lista(r.top_clientes).map(x => ({ nome: String(x.nome), total: num(x.total), atendimentos: num(x.atendimentos) })),
    },
    procedimentosPorFaixa: {
      temCustos: r.tem_custos === true,
      volume:    lista(r.volume_por_faixa).map(x => ({ faixa: String(x.faixa), nome: String(x.nome), n: num(x.n) })),
      margem:    lista(r.margem_por_faixa).map(x => ({ faixa: String(x.faixa), nome: String(x.nome), margem: num(x.margem) })),
    },
    comissoesPorProfissional: lista(r.comissoes_por_profissional).map(x => ({ nome: String(x.nome), aberta: num(x.aberta), paga: num(x.paga) })),
    estoque: {
      valorEmEstoque:    num(r.valor_em_estoque),
      criticos:          num(r.criticos),
      zerados:           num(r.zerados),
      valorPorCategoria: lista(r.valor_por_categoria).map(x => ({ categoria: String(x.categoria), valor: num(x.valor) })),
      porUnidade:        lista(r.estoque_por_unidade).map(x => ({
        branchId: String(x.branch_id), itens: num(x.itens), zerados: num(x.zerados),
        criticos: num(x.criticos), valor: num(x.valor),
      })),
      maisConsumidos:    lista(r.mais_consumidos).map(x => ({ nome: String(x.nome), valor: num(x.valor) })),
    },
  }
}
