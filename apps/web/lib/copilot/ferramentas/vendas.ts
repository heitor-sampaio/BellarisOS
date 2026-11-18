import 'server-only'
import { z } from 'zod/v4'
import type { TenantContext } from '@estetica-os/types'
import { isOwnScope, podeReceber, podeVerFechamento } from '@/lib/auth'
import { ler } from '@/lib/db'
import { comandasDoPdv } from '@/lib/pdv/comandas'
import { seloDaComanda } from '@/lib/pdv/situacoes'
import { diaDoFechamento, janelaDoDia as janelaDoFechamento } from '@/lib/financeiro/fechamento'
import { getEmAbertoDasVendas } from '@/lib/metrics/pacote-em-aberto'
import { situacoesDosPlanos } from '@/lib/plano-de-tratamento/andamento-do-plano'
import { rotuloDaSituacaoComercial } from '@/lib/plano-de-tratamento/situacao'
import { clienteAtendidaPor } from '@/lib/clientes/atendida-por'
import type { ContextoDaFerramenta, FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import {
  dinheiro, fusoDe, fusosPorUnidade, idsDasUnidades, nomesPorId, ondeProcurou, quandoLegivel, resolverCliente, resolverUnidade, rota,
} from '@/lib/copilot/ferramentas/comum'

/**
 * As leituras de VENDA do Copilot (CP1, as pendências das simulações 15ª–23ª,
 * 2026-11-17): as comandas abertas do PDV e os planos de tratamento. SÓ
 * LEITURA — vender, receber e aceitar plano é na tela (o PDV, o plano), não
 * pelo Copilot.
 *
 * O valor só a quem vê o valor (`mostraOValor`): quem recebe (`podeReceber`) ou
 * vê o dinheiro da unidade (`podeVerFechamento`) — a mesma régua da agenda e
 * do atendimento. Nada clínico: a anotação do plano fica no plano.
 */
export function mostraOValor(ctx: TenantContext): boolean {
  return podeReceber(ctx) || podeVerFechamento(ctx)
}

const ORIGEM: Record<string, string> = { ATENDIMENTO: 'atendimento', PLANO: 'plano de tratamento', VENDA: 'venda' }
const STATUS_DO_ATENDIMENTO: Record<string, string> = {
  SCHEDULED: 'agendado', CONFIRMED: 'confirmado', ARRIVED: 'chegou', IN_PROGRESS: 'em atendimento', COMPLETED: 'concluído',
}

export const comandasAbertas: FerramentaDeLeitura<{ unidade?: string; cliente?: string }> = {
  nome: 'comandas_abertas',
  tipo: 'leitura',
  // O PDV é de quem recebe; o Fechamento do dia, também de quem vê o dinheiro da unidade.
  pode: ctx => podeReceber(ctx) || podeVerFechamento(ctx),
  descricao: 'As comandas ABERTAS do PDV (o que falta receber: o atendimento atendido a pagar, o plano aceito a pagar, a venda a receber), por unidade (padrão: as da pessoa) e, se pedido, de um cliente (id, nome ou telefone). Até 50. Só lê: receber é no PDV, na tela — dê o link da comanda.',
  parametros: z.object({
    unidade: z.string().max(80).optional(),
    cliente: z.string().min(2).max(120).optional(),
  }),
  async executar(c, args) {
    const u = await resolverUnidade(c, args.unidade, { paraLer: true })
    if ('erro' in u) return { dados: { erro: u.erro } }
    const unidades = await idsDasUnidades(c, u.unidade)
    const procurouEm = await ondeProcurou(c, unidades)
    let clienteId: string | null = null
    if (args.cliente) {
      const achado = await resolverCliente(c, args.cliente)
      if ('erro' in achado) return { dados: { erro: achado.erro } }
      clienteId = achado.id
    }
    const [fusos, nomes] = await Promise.all([fusosPorUnidade(c, unidades), nomesPorId(c, 'branches', unidades)])
    // A aberta não depende do dia (a janela só recorta as pagas e as canceladas).
    const porUnidade = await Promise.all(unidades.map(async b => {
      const fuso = fusos.get(b) ?? await fusoDe(c, b)
      const janela = janelaDoFechamento(diaDoFechamento(undefined, new Date(), fuso), new Date(), fuso)!
      const lista = await comandasDoPdv({ tenantId: c.ctx.tenantId!, branchId: b, situacao: 'ABERTAS', de: janela.from, ate: janela.to })
      return lista.map(k => ({ k, b, fuso }))
    }))
    const todas = porUnidade.flat().filter(x => !clienteId || x.k.clienteId === clienteId)
    const valor = mostraOValor(c.ctx)
    const itens = todas.slice(0, 50).map(({ k, b, fuso }) => ({
      id: k.id, numero: k.numero, origem: ORIGEM[k.origem] ?? k.origem, situacao: seloDaComanda(k).texto,
      cliente: k.cliente, procedimento: k.procedimento, profissional: k.profissional,
      agendadoPara: k.agendadoPara ? quandoLegivel(k.agendadoPara, fuso) : null,
      atendimento: k.atendimento ? (STATUS_DO_ATENDIMENTO[k.atendimento] ?? k.atendimento) : null,
      unidade: nomes.get(b) ?? null,
      ...(valor ? { valor: dinheiro(k.valor), ...(k.emAberto > 0 ? { emAberto: dinheiro(k.emAberto) } : {}) } : {}),
      href: rota(c, `/pdv?unidade=${b}&comanda=${k.id}`),
    }))
    return {
      dados: {
        procurouEm, quantidade: todas.length, comandas: itens,
        ...(todas.length > 50 ? { aviso: `Mostrando 50 de ${todas.length}.` } : {}),
        ...(valor ? {} : { semValor: 'O valor das comandas fica no PDV, para quem recebe.' }),
      },
      cartao: itens.length ? {
        tipo: 'links',
        itens: itens.slice(0, 12).map(i => ({
          texto: `Comanda ${i.numero} · ${i.cliente}`,
          detalhe: [i.procedimento ?? i.origem, i.situacao, 'valor' in i ? i.valor : null].filter(Boolean).join(' · ') || undefined,
          href: i.href,
        })),
      } : undefined,
    }
  },
}

type PlanoLido = {
  id: string; name: string | null; status: string; created_at: string; branch_id: string; professional_id: string | null
  treatment_plan_sessions: {
    sort_order: number; appointment_id: string | null
    treatment_plan_session_procedures: { price: number | string | null; sort_order: number | null; procedures: { name: string } | null }[]
  }[]
}

/**
 * Os planos de tratamento de UMA cliente, lidos para a ficha (`cliente`) e
 * para a ferramenta `plano`. O tratamento é da rede (H5); com o Atendimento "só os
 * meus", os que ela montou e os das clientes que ela atende — a regra da tela
 * (`planoDaProfissional`).
 */
export async function planosDaCliente(c: ContextoDaFerramenta, clientId: string, comSessoes: boolean) {
  const rede = c.ctx.tenantId!
  let lidos = (await ler(c.admin.from('treatment_plans')
    .select(`id, name, status, created_at, branch_id, professional_id, branches!inner(tenant_id),
      treatment_plan_sessions(sort_order, appointment_id, treatment_plan_session_procedures(price, sort_order, procedures(name)))`)
    .eq('client_id', clientId).eq('branches.tenant_id', rede)
    .order('created_at', { ascending: false }).limit(20), 'ler os planos da cliente') as PlanoLido[] | null) ?? []
  if (isOwnScope(c.ctx, 'atendimento')) {
    const eu = c.ctx.internalUserId
    const atendida = !!eu && await clienteAtendidaPor(c.admin, eu, clientId)
    lidos = lidos.filter(p => atendida || (!!eu && p.professional_id === eu))
  }
  if (!lidos.length) return []

  const agendamentos = lidos.flatMap(p => p.treatment_plan_sessions.map(s => s.appointment_id)).filter((x): x is string => !!x)
  const valor = mostraOValor(c.ctx)
  const [situacoes, status, emAberto, unidades] = await Promise.all([
    situacoesDosPlanos(rede, lidos.map(p => ({ id: p.id, status: p.status }))),
    agendamentos.length
      ? ler(c.admin.from('appointments').select('id, status, started_at').in('id', agendamentos), 'ler as sessões agendadas') as Promise<{ id: string; status: string; started_at: string | null }[] | null>
      : Promise.resolve([]),
    valor ? getEmAbertoDasVendas(rede, lidos.map(p => p.id)) : Promise.resolve({} as Awaited<ReturnType<typeof getEmAbertoDasVendas>>),
    nomesPorId(c, 'branches', lidos.map(p => p.branch_id)),
  ])
  const statusDe = new Map((status ?? []).map(a => [a.id, a.status]))
  // A desistência no meio conta como feita (o Heitor, 2026-11-18; como o
  // `metrics_financeiro_do_plano`): a sessão não volta à cliente.
  const usadaNaDesistencia = new Set((status ?? []).filter(a => a.status === 'CANCELLED' && a.started_at).map(a => a.id))

  return lidos.map(p => {
    const sessoes = [...p.treatment_plan_sessions].sort((a, b) => a.sort_order - b.sort_order)
    const total = sessoes.reduce((s, x) => s + x.treatment_plan_session_procedures.reduce((t, y) => t + Number(y.price ?? 0), 0), 0)
    const feitas = sessoes.filter(s => s.appointment_id && (statusDe.get(s.appointment_id) === 'COMPLETED' || usadaNaDesistencia.has(s.appointment_id))).length
    const agendadas = sessoes.filter(s => s.appointment_id && !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(statusDe.get(s.appointment_id) ?? '')).length
    const aberto = emAberto[p.id]
    return {
      id: p.id, nome: p.name ?? 'Plano de tratamento',
      situacao: rotuloDaSituacaoComercial(situacoes.get(p.id) ?? 'RASCUNHO'),
      criadoEm: p.created_at.slice(0, 10), unidade: unidades.get(p.branch_id) ?? null,
      sessoes: sessoes.length, feitas, agendadas,
      ...(valor ? { valorTotal: dinheiro(total), ...(aberto && aberto.valor > 0 ? { emAberto: dinheiro(aberto.valor), parcelasEmAberto: aberto.parcelas } : {}) } : {}),
      ...(comSessoes ? {
        listaDeSessoes: sessoes.map((s, i) => ({
          numero: i + 1,
          procedimentos: [...s.treatment_plan_session_procedures].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(x => x.procedures?.name ?? 'Procedimento'),
          situacao: !s.appointment_id ? 'a agendar' : statusDe.get(s.appointment_id) === 'COMPLETED' ? 'feita' : 'agendada',
        })),
      } : {}),
      href: rota(c, `/planejamentos/${p.id}`),
    }
  })
}

export const plano: FerramentaDeLeitura<{ cliente: string }> = {
  nome: 'plano',
  tipo: 'leitura',
  modulo: 'atendimento', nivel: 'VIEW',
  recurso: 'planos_de_tratamento',
  descricao: 'Os planos de tratamento de UM cliente (id, nome ou telefone): a situação (proposto, aceito, falta pagar, em andamento…), as sessões (procedimentos, feitas, agendadas, a agendar) e, para quem vê o valor, o total e o em aberto. Só lê: montar, aceitar e receber o plano é na tela do plano — dê o link. Nada clínico (a anotação do plano fica no plano).',
  parametros: z.object({ cliente: z.string().min(2).max(120).describe('Id, nome ou telefone do cliente.') }),
  async executar(c, { cliente }) {
    const achado = await resolverCliente(c, cliente)
    if ('erro' in achado) return { dados: { erro: achado.erro } }
    const planos = await planosDaCliente(c, achado.id, true)
    return {
      dados: { cliente: achado.name, quantidade: planos.length, planos },
      cartao: planos.length ? {
        tipo: 'links',
        itens: planos.slice(0, 8).map(p => ({ texto: p.nome, detalhe: `${p.situacao} · ${p.feitas} de ${p.sessoes} sessões`, href: p.href })),
      } : undefined,
    }
  },
}
