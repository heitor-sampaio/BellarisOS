import 'server-only'
import { getCore, type MetricsCore } from './queries'
import { getRelatorio, type Relatorio } from './relatorio'
import { juntarNucleos, juntarPorNome, type RecorteDosModulos } from './escopo'

/**
 * O núcleo e os relatórios com CADA número no escopo do seu módulo (decisão
 * do Heitor, 2026-10-29; a regra em ./escopo). As funções do banco recebem UM
 * profissional (`p_professional_id`); com a agenda e o financeiro em recortes
 * diferentes, pedem-se os dois e juntam-se aqui. Com o mesmo recorte, uma
 * chamada só.
 */

type Recorte = Pick<RecorteDosModulos, 'agenda' | 'financeiro'>

export async function getCoreDosModulos(args: {
  tenantId: string; branchIds?: string[] | null; from: Date; to: Date; recorte: Recorte
}): Promise<MetricsCore> {
  const { recorte, ...base } = args
  if (recorte.agenda === recorte.financeiro) return getCore({ ...base, professionalId: recorte.agenda })
  const [daAgenda, doDinheiro] = await Promise.all([
    getCore({ ...base, professionalId: recorte.agenda }),
    getCore({ ...base, professionalId: recorte.financeiro }),
  ])
  return juntarNucleos(daAgenda, doDinheiro)
}

/**
 * Os agregados da aba com o dinheiro do recorte do financeiro e a agenda (e
 * as clientes) do recorte da agenda:
 * - DINHEIRO: receita por unidade, forma e categoria; o consumo de insumo (é
 *   custo); a receita por categoria de procedimento; quem mais gasta; a
 *   margem por faixa; as comissões; os insumos mais consumidos;
 * - AGENDA: agendamentos por status, dia da semana, origem e unidade; a base
 *   de clientes (ativos, faixa, gênero, cidades); o volume por faixa;
 * - as tabelas por procedimento e por profissional juntam os dois pelo nome
 *   (execuções da agenda, receita do dinheiro);
 * - o saldo do estoque não tem dono (vem igual dos dois).
 */
export async function getRelatorioDosModulos(
  args: Omit<Parameters<typeof getRelatorio>[0], 'professionalId'> & { recorte: Recorte },
): Promise<Relatorio> {
  const { recorte, ...base } = args
  if (recorte.agenda === recorte.financeiro) return getRelatorio({ ...base, professionalId: recorte.agenda })
  const [a, d] = await Promise.all([
    getRelatorio({ ...base, professionalId: recorte.agenda }),
    getRelatorio({ ...base, professionalId: recorte.financeiro }),
  ])
  return {
    ...a,
    receitaPorUnidade:   d.receitaPorUnidade,
    receitaPorForma:     d.receitaPorForma,
    receitaPorCategoria: d.receitaPorCategoria,
    consumoTotal:        d.consumoTotal,
    receitaPorCategoriaDeProcedimento: d.receitaPorCategoriaDeProcedimento,
    porProcedimento:     juntarPorNome(a.porProcedimento, d.porProcedimento, ['receita']),
    porProfissional:     juntarPorNome(a.porProfissional, d.porProfissional, ['receita']),
    clientes:            { ...a.clientes, topClientes: d.clientes.topClientes },
    procedimentosPorFaixa: { ...a.procedimentosPorFaixa, temCustos: d.procedimentosPorFaixa.temCustos, margem: d.procedimentosPorFaixa.margem },
    comissoesPorProfissional: d.comissoesPorProfissional,
    estoque:             { ...a.estoque, maisConsumidos: d.estoque.maisConsumidos },
  }
}
