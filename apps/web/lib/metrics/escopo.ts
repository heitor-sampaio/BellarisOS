import type { TenantContext } from '@estetica-os/types'
import type { MetricsCore } from './queries'

/**
 * Cada número segue o escopo do SEU módulo (decisão do Heitor, 2026-10-29):
 *
 * - a AGENDA e as CLIENTES seguem o escopo da agenda — atendimentos,
 *   agendamentos, novos clientes, a ocupação, a retenção, as clientes a
 *   reativar, os rankings que contam;
 * - o DINHEIRO segue o do financeiro — receita, a receber, despesa, ticket,
 *   comissão, vendas, o consumo de insumo (é custo) e os rankings de valor;
 * - o FUNIL segue o do CRM.
 *
 * "Com a agenda ALL e o financeiro OWN, os atendimentos são os da clínica e
 * o faturamento é o dela." Até aqui qualquer "só os meus" (agenda OU
 * financeiro) recortava TODOS os números. Módulo NONE já vale ALL no contexto
 * (`resolveScopes` + `escoposDoQueTem`, §11): o recorte só existe no módulo
 * que o cargo tem.
 *
 * Puro (roda no teste): o contexto entra pronto, e as funções que leem o
 * banco recebem o recorte de cada módulo.
 */

/** Ninguém: com "só os meus" e sem membro interno, nenhum número (nunca a rede). */
export const NINGUEM = '00000000-0000-0000-0000-000000000000'

export interface RecorteDosModulos {
  /** A profissional da agenda (e das clientes) — nulo = todos. */
  agenda:     string | null
  /** A dona do dinheiro (o financeiro) — nulo = todos. */
  financeiro: string | null
  /** O dono das oportunidades (o CRM; os sem dono entram junto) — nulo = todos. */
  crm:        string | null
}

export function recorteDosModulos(ctx: Pick<TenantContext, 'scopes' | 'internalUserId'>): RecorteDosModulos {
  const dele = (modulo: 'agenda' | 'financial' | 'crm') =>
    ctx.scopes[modulo] === 'OWN' ? (ctx.internalUserId ?? NINGUEM) : null
  return { agenda: dele('agenda'), financeiro: dele('financial'), crm: dele('crm') }
}

/**
 * Um núcleo com o DINHEIRO de um recorte e a AGENDA (e as clientes) do outro.
 * `metrics_core` recebe UM profissional; com os dois recortes diferentes, a
 * tela pede os dois núcleos e junta aqui — o dinheiro (receita, a receber,
 * despesa, receita de serviço, comissões) do financeiro, as contagens
 * (atendimentos, agendamentos, minutos, novos clientes, cobrados) da agenda.
 */
export function juntarNucleos(daAgenda: MetricsCore, doDinheiro: MetricsCore): MetricsCore {
  return {
    ...daAgenda,
    revenueCash:     doDinheiro.revenueCash,
    revenuePending:  doDinheiro.revenuePending,
    expensesCash:    doDinheiro.expensesCash,
    serviceRevenue:  doDinheiro.serviceRevenue,
    commissionsOpen: doDinheiro.commissionsOpen,
    commissionsPaid: doDinheiro.commissionsPaid,
  }
}

/**
 * A tabela que mistura contagem e dinheiro numa linha (por procedimento, por
 * profissional): os campos de DINHEIRO vêm do recorte do financeiro e o resto
 * (as contagens) do recorte da agenda, casados pelo nome. A linha que só um
 * dos dois tem entra com zero no que falta. Assim a profissional com a agenda
 * de todos e o financeiro dela vê quantas limpezas a clínica fez, e quanto
 * delas foi dela.
 */
export function juntarPorNome<T extends { nome: string }>(daAgenda: T[], doDinheiro: T[], camposDeDinheiro: (keyof T)[]): T[] {
  const doNome = new Map(doDinheiro.map(l => [l.nome, l]))
  const zerado = (l: T, campos: (keyof T)[]) => {
    const z = { ...l }
    for (const c of campos) (z as Record<keyof T, unknown>)[c] = 0
    return z
  }
  const linhas = daAgenda.map(l => {
    const d = doNome.get(l.nome)
    const linha = { ...l }
    for (const c of camposDeDinheiro) (linha as Record<keyof T, unknown>)[c] = d ? d[c] : 0
    return linha
  })
  const naAgenda = new Set(daAgenda.map(l => l.nome))
  const camposDaAgenda = (l: T) => (Object.keys(l) as (keyof T)[])
    .filter(k => k !== 'nome' && !camposDeDinheiro.includes(k) && typeof l[k] === 'number')
  for (const d of doDinheiro) if (!naAgenda.has(d.nome)) linhas.push(zerado(d, camposDaAgenda(d)))
  return linhas
}
