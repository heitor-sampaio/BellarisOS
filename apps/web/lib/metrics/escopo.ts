import type { TenantContext } from '@estetica-os/types'
import { vistaPessoal, temRecurso } from '@/lib/auth'
import type { MetricsCore } from './queries'

/**
 * Os números da VISTA PESSOAL nos dashboards (sem o "só os meus", o Heitor,
 * 2026-11-23: "as vistas pessoais resolvem"). Quem tem o módulo vê os números
 * de todos, nas unidades ao alcance; quem ATENDE e não tem o módulo vê os
 * "Meus…" — a agenda e as clientes dela (`vistaPessoal(ctx, 'agenda')`), o
 * dinheiro dela (`vistaPessoal(ctx, 'financial')`). O CRM não tem vista
 * pessoal: quem quer só as suas usa o filtro de responsável.
 *
 * A vista só existe com a funcionalidade no plano: o módulo cortado pelo plano
 * também é NONE, e não vira "Meu faturamento".
 *
 * As funções que leem o banco recebem UM profissional; com a agenda e o
 * dinheiro em recortes diferentes, pedem-se os dois e juntam-se aqui.
 */

export interface RecortePessoal {
  /** A profissional da agenda (e das clientes) — nulo = todos. */
  agenda:     string | null
  /** A dona do dinheiro — nulo = todos. */
  financeiro: string | null
  /** O CRM não tem vista pessoal: sempre nulo (todos). */
  crm:        null
}

export function recortePessoal(ctx: TenantContext): RecortePessoal {
  return {
    agenda:     temRecurso(ctx, 'agenda') ? vistaPessoal(ctx, 'agenda') : null,
    financeiro: temRecurso(ctx, 'financeiro') ? vistaPessoal(ctx, 'financial') : null,
    crm:        null,
  }
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
 * dos dois tem entra com zero no que falta.
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

/**
 * As unidades dos números "Meus…" (D10 da 13ª simulação): na vista pessoal, a
 * unidade do endereço e as outras em que ela ATENDE (`users.atende_em`) — o
 * que é DELA, onde quer que tenha atendido, como a Minha agenda e "Minhas
 * comissões". Fora da vista pessoal, só a do endereço (os números da
 * unidade). A unidade do endereço vem primeiro.
 */
export function unidadesDoQueEDela(
  ctx: TenantContext,
  unidade: string,
  modulo: 'agenda' | 'financial',
): string[] {
  const recorte = recortePessoal(ctx)
  if ((modulo === 'agenda' ? recorte.agenda : recorte.financeiro) === null) return [unidade]
  return [unidade, ...(ctx.atendeEm ?? []).filter(u => u !== unidade).sort()]
}

/**
 * As unidades de um número "Meu…", pelo nome ("Friburgo e Teresópolis"), na
 * ordem de `unidadesDoQueEDela` (D5 da 43ª; princípio 3): a do endereço entra
 * mesmo sem o "Atende" nela, e "nas 2 unidades em que você atende" não era
 * verdade para quem atende em uma.
 */
export function nomesDasUnidades(ids: string[], nomeDe: Map<string, string>): string {
  const nomes = ids.map(id => nomeDe.get(id)).filter((n): n is string => !!n)
  return new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' }).format(nomes)
}
