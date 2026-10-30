import { ratio, percent } from './period'
import type { FunnelStage } from './queries'

/**
 * Ticket médio, lucro e margem — as contas que as telas faziam cada uma
 * (Relatórios, o financeiro da unidade e da rede, o dashboard, a ficha). Puro:
 * recebe os números do banco (metrics_core, metrics_gasto_por_cliente) e
 * divide; nenhuma tela soma ou divide por conta própria (§13.1).
 */

/**
 * Ticket médio = a média de quanto cada CLIENTE gasta na clínica: o que as
 * clientes pagaram no período ÷ as clientes que pagaram (decisão do Heitor,
 * 2026-10-29; `metrics_ticket_medio`, `getTicketMedio`). Pelo eixo da receita
 * paga, entra tudo que tem cliente — atendimento, pacote, plano, pré-pago,
 * produto. Sem cliente que pagou, nulo: a tela mostra "—", não R$ 0,00.
 * Era receita de serviço ÷ atendimentos cobrados (2026-10-27); essa conta
 * ficou só na ficha da cliente, com outro nome (`mediaPorAtendimentoCobrado`).
 */
export function ticketMedio(n: { pagoPelasClientes: number; clientesQuePagaram: number }): number | null {
  return ratio(n.pagoPelasClientes, n.clientesQuePagaram)
}

/**
 * A "Média por atend." da FICHA da cliente: a receita de serviço dela ÷ os
 * concluídos COBRADOS (a avaliação de R$ 0 não puxa a média). Era o "ticket
 * médio" do sistema até 2026-10-29; numa cliente só, o ticket novo (pago ÷
 * clientes) seria o próprio LTV, e a ficha guardou a média por atendimento —
 * com o nome que diz a conta.
 */
export function mediaPorAtendimentoCobrado(n: { serviceRevenue: number; appointmentsCharged: number }): number | null {
  return ratio(n.serviceRevenue, n.appointmentsCharged)
}

/**
 * As médias das TABELAS, que a tela dividia por conta própria (frente F,
 * 2026-10-28). Não são o ticket médio — dividem outro conjunto, e por isso
 * têm outro nome na tela (D11):
 * - "Média por atend." (ranking de clientes do dashboard da rede): o que a
 *   cliente PAGOU no período ÷ os atendimentos concluídos dela
 *   (`metrics_top_clients`); a ficha é que tem o ticket dela.
 * - "Média por execução" (Relatórios → Procedimentos): a receita do
 *   procedimento ÷ as execuções dele (`metrics_relatorio`), e o "% do Total",
 *   a parte dele na receita de serviço do período.
 * Sem denominador, nulo (a tela mostra "—" ou zero, como mostrava).
 */
export function mediaPorAtendimento(c: { totalSpent: number; appointments: number }): number | null {
  return ratio(c.totalSpent, c.appointments)
}

export function mediaPorExecucao(p: { receita: number; execucoes: number }): number | null {
  return ratio(p.receita, p.execucoes)
}

export function participacaoPct(parte: number, total: number): number | null {
  return percent(parte, total)
}

export interface ResultadoDoPeriodo {
  /** Receita paga − despesa operacional paga − insumo consumido (decisão do Heitor, 2026-10-29). */
  lucro:     number
  /** Lucro ÷ receita, em %. Nulo sem receita: não é 0%. */
  margemPct: number | null
  /** A despesa paga SEM a compra de estoque: a que entra no lucro. */
  despesaOperacional: number
  /** O insumo consumido nos atendimentos, ao custo do movimento: entra no lucro. */
  insumoConsumido: number
}

/** As parcelas do resultado que não estão no núcleo (`metrics_resultado`, `getResultadoDoEstoque`). */
export interface EstoqueNoResultado {
  /** A despesa paga da categoria "Compra de estoque": conta no CAIXA, não no lucro. */
  compraDeEstoque: number
  /** O insumo consumido nos atendimentos (custo do movimento): desconta do lucro. */
  consumoDeInsumo: number
}

/**
 * O resultado do período: lucro = receita paga − (despesa paga − compra de
 * estoque paga) − insumo consumido; margem = lucro ÷ receita (decisão do
 * Heitor, 2026-10-29). O insumo entra pelo que foi CONSUMIDO; a compra fica no
 * caixa (é o que saiu) e fora do lucro — senão o produto seria descontado
 * duas vezes. Até 2026-10-29 o lucro era receita − despesa paga, e o consumo
 * era só informativo.
 */
export function resultadoDoPeriodo(n: { revenueCash: number; expensesCash: number } & EstoqueNoResultado): ResultadoDoPeriodo {
  const despesaOperacional = n.expensesCash - n.compraDeEstoque
  const lucro = n.revenueCash - despesaOperacional - n.consumoDeInsumo
  const r = ratio(lucro, n.revenueCash)
  return { lucro, margemPct: r === null ? null : r * 100, despesaOperacional, insumoConsumido: n.consumoDeInsumo }
}

export const SEM_ESTOQUE_NO_RESULTADO: EstoqueNoResultado = { compraDeEstoque: 0, consumoDeInsumo: 0 }

/**
 * A variação da margem, em PONTOS percentuais (20% → 22% é "+2,0 p.p.", não
 * "+10%" — percentual de percentual não existe). Nula sem uma das margens.
 */
export function variacaoDaMargemPp(atual: ResultadoDoPeriodo, anterior: ResultadoDoPeriodo): number | null {
  if (atual.margemPct === null || anterior.margemPct === null) return null
  return atual.margemPct - anterior.margemPct
}

/**
 * A variação percentual contra o período anterior. SEM base de comparação
 * (anterior = 0) não existe variação: nulo, e a tela diz "sem dados
 * anteriores" — antes o dashboard inventava "100%" a partir do zero (A37 da
 * simulação de 2026-10-27), enquanto os Relatórios diziam a verdade.
 */
export function variacaoPercentual(atual: number, anterior: number): { pct: number; up: boolean } | null {
  if (anterior === 0) return null
  const pct = ((atual - anterior) / anterior) * 100
  return { pct: Math.abs(pct), up: pct >= 0 }
}

/**
 * A conversão das oportunidades: as GANHAS (na etapa de desfecho WON) ÷ as
 * oportunidades, sem olhar se a pessoa já é cliente (decisão do Heitor,
 * 2026-10-29: "o objeto é a oportunidade"). Sem etapa de ganho — no funil, ou
 * em nenhum dos funis que a tela junta — não há conversão: nulo, e a tela
 * mostra "—". Sem oportunidade, também nulo.
 */
export function conversaoDasOportunidades(n: { total: number; ganhos: number; temGanho: boolean }): number | null {
  return n.temGanho ? percent(n.ganhos, n.total) : null
}

/**
 * O resumo de UM funil, a partir das etapas que o banco contou
 * (`metrics_lead_funnel`): o total, as ganhas e as perdidas, as que já são de
 * cliente (`convertidos` — só informativo: "já é cliente" é filtro do quadro,
 * não conversão) e a conversão = ganhas ÷ total (`conversaoDasOportunidades`).
 * É a conta do dashboard, dos Relatórios e do quadro de Oportunidades. Até
 * 2026-10-29 era "viraram cliente ÷ leads" (D10 de 2026-10-28), e o Heitor a
 * devolveu à oportunidade.
 */
export function resumoDoFunil(etapas: FunnelStage[]) {
  const soma = (f: (e: FunnelStage) => number) => etapas.reduce((s, e) => s + f(e), 0)
  const total = soma(e => e.leads)
  const ganhos = soma(e => (e.outcome === 'WON' ? e.leads : 0))
  const temGanho = etapas.some(e => e.outcome === 'WON')
  return {
    total,
    convertidos: soma(e => e.converted),
    ganhos,
    perdidos: soma(e => (e.outcome === 'LOST' ? e.leads : 0)),
    /** O funil marca etapa de ganho / de perda (senão não há o que mostrar). */
    temGanho,
    temPerda: etapas.some(e => e.outcome === 'LOST'),
    conversaoPct: conversaoDasOportunidades({ total, ganhos, temGanho }),
  }
}

/**
 * As taxas que a tela de Relatórios dividia por conta própria (decisão do
 * Heitor, 2026-10-29; §13.1). Mudança de lugar: os números não mudam. Sem
 * denominador, nulo (a tela mostra o zero de sempre).
 */

/** Taxa de conclusão da agenda: concluídos ÷ agendamentos do período, em %. */
export function taxaDeConclusao(n: { concluidos: number; total: number }): number | null {
  return percent(n.concluidos, n.total)
}

/** Retenção: as clientes atendidas que já tinham vindo antes ÷ as atendidas no período, em %. */
export function taxaDeRetencao(r: { clientsServed: number; returningClients: number }): number | null {
  return percent(r.returningClients, r.clientsServed)
}

/** Giro do estoque: o consumo de insumo do período ÷ o valor em estoque, em %. */
export function giroDoEstoque(n: { consumo: number; valorEmEstoque: number }): number | null {
  return percent(n.consumo, n.valorEmEstoque)
}

/**
 * O total da LISTA do financeiro (o que está filtrado na tela, J-48 de
 * 2026-10-30): o pago que entrou menos o pago que saiu, COM SINAL, sem os dois
 * lados do estorno (a regra de metrics_core) — em centavos. A tela fazia o
 * reduce ela mesma e tirava o sinal com Math.abs: "6 lançamentos · R$ 2.400,00"
 * era um resultado negativo. A lista é a da tela, lida inteira (lerTodas).
 */
export function resultadoDaLista(linhas: {
  type: 'INCOME' | 'EXPENSE'; amount: number; is_paid: boolean; notes?: string | null; category?: string | null
}[]): number {
  let centavos = 0
  for (const l of linhas) {
    if (!l.is_paid || (l.notes ?? '') === 'Estornada' || (l.category ?? '') === 'Estorno') continue
    const v = Math.round(Number(l.amount) * 100)
    centavos += l.type === 'INCOME' ? v : -v
  }
  return centavos / 100
}

/**
 * As fatias do "Status dos agendamentos" (J-57, 2026-10-30): concluídos,
 * cancelados, faltas e EM ABERTO (agendados, confirmados, na clínica, em
 * atendimento — inclusive os que ainda vão acontecer), sobre o núcleo do
 * período. O gráfico da Visão geral deixava os abertos de fora.
 */
export function statusDosAgendamentos(n: { total: number; concluidos: number; cancelados: number; faltas: number }): { status: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'ABERTO'; n: number }[] {
  return [
    { status: 'COMPLETED', n: n.concluidos },
    { status: 'CANCELLED', n: n.cancelados },
    { status: 'NO_SHOW',   n: n.faltas },
    { status: 'ABERTO',    n: Math.max(0, n.total - n.concluidos - n.cancelados - n.faltas) },
  ]
}

/**
 * O "Mais realizado" dos Relatórios → Procedimentos (J-58, 2026-10-30): o de
 * mais execuções; no empate, o de MAIOR RECEITA (desempatePelaReceita); e,
 * empatando também nela, todos os empatados — a tela diz que houve empate.
 * Escolhia pela ordem em que o banco devolvia (alfabética), calado.
 */
export function maisRealizado(lista: { nome: string; execucoes: number; receita: number }[]): { nomes: string[]; execucoes: number; desempatePelaReceita: boolean } | null {
  const centavos = (v: number) => Math.round(v * 100)
  const ordem = [...lista].sort((a, b) => b.execucoes - a.execucoes || centavos(b.receita) - centavos(a.receita))
  const primeiro = ordem[0]
  if (!primeiro || primeiro.execucoes <= 0) return null
  const mesmasExecucoes = ordem.filter(x => x.execucoes === primeiro.execucoes)
  const empatados = mesmasExecucoes.filter(x => centavos(x.receita) === centavos(primeiro.receita))
  return {
    nomes: empatados.map(x => x.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    execucoes: primeiro.execucoes,
    desempatePelaReceita: mesmasExecucoes.length > 1 && empatados.length === 1,
  }
}
