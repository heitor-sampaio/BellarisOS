import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas, contar } from '@/lib/db'
import { unitTag } from '@estetica-os/utils'
import { mediaPorAtendimentoCobrado } from './resultado'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'

/**
 * Contagens das telas da UNIDADE, agregadas no Postgres (migration
 * `20260927000010`). As duas eram feitas em JS sobre selects sem limite e
 * cortavam em 1000 linhas (§13.1).
 */

/** Sessões concluídas por procedimento nas unidades dadas, desde sempre. */
export async function getSessoesPorProcedimento(branchIds: string[]): Promise<Map<string, number>> {
  const data = await ler(createAdminClient().rpc('metrics_sessoes_por_procedimento', {
    p_branch_ids: branchIds,
  }), 'contar as sessões por procedimento')
  return new Map(((data ?? []) as { procedure_id: string; sessoes: number | string }[])
    .map(r => [r.procedure_id, Number(r.sessoes)]))
}

/**
 * O dinheiro de UM cliente — a MESMA conta do "Gasto médio" de Relatórios →
 * Clientes (`metrics_gasto_por_cliente`, A26 da simulação de 2026-10-27): a
 * ficha dizia "ticket R$ 0,00" ao lado de "LTV R$ 600", e os relatórios, "gasto
 * médio R$ 390", cada um de uma conta. Aqui a função é chamada com a cliente e
 * a janela inteira; lá, com o período.
 */
export interface DoCliente {
  /** O que o cliente pagou, desde sempre — pago, sem estorno (= LTV do dashboard). */
  ltv: number
  /** Atendimentos concluídos, desde sempre. */
  atendimentos: number
  /** A "Média por atend." da ficha: serviço ÷ concluídos COBRADOS (não é o ticket médio do sistema, pago ÷ clientes — numa cliente só ele seria o LTV). Nulo sem atendimento cobrado. */
  mediaPorAtendimento: number | null
}

export async function getDoCliente(tenantId: string, clientId: string): Promise<DoCliente> {
  const data = await ler(createAdminClient().rpc('metrics_gasto_por_cliente', {
    p_tenant: tenantId, p_branch_ids: null, p_from: '2000-01-01T00:00:00Z', p_to: 'infinity', p_cliente: clientId,
  }), 'calcular o investido do cliente')
  const d = ((data ?? []) as { pago: number | string | null; receita_servico: number | string; atendimentos: number | string; atendimentos_cobrados: number | string }[])[0]
  return {
    ltv: Number(d?.pago ?? 0),
    atendimentos: Number(d?.atendimentos ?? 0),
    mediaPorAtendimento: mediaPorAtendimentoCobrado({ serviceRevenue: Number(d?.receita_servico ?? 0), appointmentsCharged: Number(d?.atendimentos_cobrados ?? 0) }),
  }
}

/**
 * O saldo do crédito interno da cliente (concessões − usos), do banco — a
 * mesma conta da aba Financeiro da ficha (`metrics_financeiro_do_cliente`).
 * É o que o Financeiro do app mostra (D-17, 2026-10-30).
 */
export async function getCreditoInternoDoCliente(tenantId: string, clientId: string): Promise<number> {
  const data = await ler(createAdminClient().rpc('metrics_financeiro_do_cliente', {
    p_tenant: tenantId, p_client: clientId, p_profissional: null,
  }), 'calcular o crédito interno do cliente')
  const d = ((data ?? []) as { credito: number | string | null }[])[0]
  return Number(d?.credito ?? 0)
}

/** Custo × saldo das unidades dadas (o "valor em estoque"). */
export async function getValorEmEstoque(branchIds: string[]): Promise<number> {
  const data = await ler(createAdminClient().rpc('metrics_valor_em_estoque', {
    p_branch_ids: branchIds,
  }), 'calcular o valor em estoque')
  return Number(data ?? 0)
}

/**
 * O valor de cada produto em estoque (a coluna "Valor" da tela de estoque): o
 * saldo em CONSUMO × o custo de consumo, a conta de metrics_valor_em_estoque
 * (A39, 2026-10-27 — a tela multiplicava as embalagens pelo preço da
 * embalagem, e 495 ml valiam R$ 450). Chave `produto` = nas unidades dadas;
 * `produto:unidade` = numa unidade.
 */
export async function getValorEmEstoquePorProduto(branchIds: string[]): Promise<Map<string, number>> {
  const linhas = await lerTodas<{ product_id: string; branch_id: string | null; valor: number | string | null }>(
    (de, ate) => createAdminClient().rpc('metrics_valor_em_estoque_por_produto', { p_branch_ids: branchIds })
      .order('product_id').order('branch_id', { nullsFirst: true }).range(de, ate),
    'calcular o valor de cada produto em estoque',
  )
  return new Map(linhas.map(l => [l.branch_id ? `${l.product_id}:${l.branch_id}` : l.product_id, Number(l.valor ?? 0)]))
}

export interface ClientesParaReativar {
  /** Quantos clientes da unidade estão sem visita desde `desde`. */
  total: number
  /** Os há mais tempo sem vir; quem nunca veio fica no fim. */
  lista: { id: string; name: string; phone: string | null; ultimaVisita: string | null }[]
  /**
   * Para o vazio dizer o que é (D16 da 8ª): as clientes do recorte com alguma
   * visita concluída, e as cadastradas desde `desde` sem nenhuma (fora do quadro).
   */
  comVisita: number
  recentesSemVisita: number
}

export async function getClientesParaReativar(args: {
  tenantId: string; branchId: string; tag: string; desde: Date; limite?: number
  /** "Só os meus": só as clientes que ela atendeu (agendamento não cancelado na unidade). */
  professionalId?: string | null
}): Promise<ClientesParaReativar> {
  const data = await ler(createAdminClient().rpc('metrics_clientes_para_reativar', {
    p_tenant: args.tenantId, p_branch_id: args.branchId, p_tag: args.tag,
    p_desde: args.desde.toISOString(), p_limite: args.limite ?? 3,
    p_professional_id: args.professionalId ?? null,
  }), 'buscar os clientes para reativar')
  const d = (data ?? {}) as {
    total?: number; com_visita?: number; recentes_sem_visita?: number
    lista?: { id: string; name: string; phone: string | null; ultima_visita: string | null }[]
  }
  return {
    total: Number(d.total ?? 0),
    comVisita: Number(d.com_visita ?? 0), recentesSemVisita: Number(d.recentes_sem_visita ?? 0),
    lista: (d.lista ?? []).map(c => ({ id: c.id, name: c.name, phone: c.phone, ultimaVisita: c.ultima_visita })),
  }
}

/**
 * As clientes a reativar da REDE (F7b, H3: "a dona vê tudo, sempre"): sem
 * visita em NENHUMA unidade da clínica desde `desde`, com a unidade de cada
 * uma — a da última visita; quem nunca veio, a do cadastro
 * (`metrics_clientes_para_reativar_rede`). A da unidade continua
 * `getClientesParaReativar`.
 */
export interface ClienteParaReativarDaRede {
  id: string; name: string; phone: string | null; ultimaVisita: string | null
  unidade: string | null; unidadeSlug: string | null
}

export async function getClientesParaReativarDaRede(args: {
  tenantId: string; desde: Date; limite?: number
  /** "Só os meus": só as clientes dela (agendamento não cancelado com ela). */
  professionalId?: string | null
}): Promise<{ total: number; lista: ClienteParaReativarDaRede[]; comVisita: number; recentesSemVisita: number }> {
  const data = await ler(createAdminClient().rpc('metrics_clientes_para_reativar_rede', {
    p_tenant: args.tenantId, p_desde: args.desde.toISOString(), p_limite: args.limite ?? 3,
    p_professional_id: args.professionalId ?? null,
  }), 'buscar os clientes da rede para reativar')
  const d = (data ?? {}) as {
    total?: number; com_visita?: number; recentes_sem_visita?: number
    lista?: { id: string; name: string; phone: string | null; ultima_visita: string | null; unidade: string | null; unidade_slug: string | null }[]
  }
  return {
    total: Number(d.total ?? 0),
    comVisita: Number(d.com_visita ?? 0), recentesSemVisita: Number(d.recentes_sem_visita ?? 0),
    lista: (d.lista ?? []).map(c => ({
      id: c.id, name: c.name, phone: c.phone, ultimaVisita: c.ultima_visita,
      unidade: c.unidade, unidadeSlug: c.unidade_slug,
    })),
  }
}

/**
 * O "Reativar clientes" de um RECORTE — a regra ÚNICA do dashboard (os dois
 * portais) e do Copilot (r3-f13-10, o Heitor em 2026-11-03: "os dois têm de
 * dar a mesma resposta"):
 * - na clínica de UMA unidade, a clínica inteira — todas as clientes ativas,
 *   com ou sem a tag da unidade (r2-ind-03: "na clínica de uma unidade, a
 *   clínica e a unidade são a mesma coisa");
 * - com várias e o recorte numa unidade, a dela (pela tag "Unidade: X");
 * - com várias e sem recorte, a clínica inteira: sem visita em NENHUMA
 *   unidade, com a unidade de cada uma.
 * Quem mostra não escolhe entre a conta da unidade e a da rede: chama esta.
 */
export async function getClientesParaReativarDoRecorte(args: {
  tenantId: string
  /** A unidade do recorte (a do portal, a do `?unidade=`, a do pedido), ou nula = a clínica toda. */
  unidade: { id: string; name: string } | null
  desde: Date; limite?: number
  /** "Só os meus" da agenda: as dela. */
  professionalId?: string | null
}): Promise<{ total: number; lista: ClienteParaReativarDaRede[]; daUnidade: boolean; comVisita: number; recentesSemVisita: number }> {
  const umaSo = await redeTemUmaUnidade(args.tenantId)
  if (args.unidade && !umaSo) {
    const r = await getClientesParaReativar({
      tenantId: args.tenantId, branchId: args.unidade.id, tag: unitTag(args.unidade.name),
      desde: args.desde, limite: args.limite, professionalId: args.professionalId,
    })
    return { ...r, lista: r.lista.map(c => ({ ...c, unidade: null, unidadeSlug: null })), daUnidade: true }
  }
  const r = await getClientesParaReativarDaRede({
    tenantId: args.tenantId, desde: args.desde, limite: args.limite, professionalId: args.professionalId,
  })
  // Com uma unidade só, dizer a unidade de cada uma é ruído (D-19).
  return { ...r, lista: umaSo ? r.lista.map(c => ({ ...c, unidade: null, unidadeSlug: null })) : r.lista, daUnidade: false }
}

/**
 * As clientes ATIVAS da rede e as que frequentam cada unidade (a tag
 * "Unidade: <nome>", o mesmo critério do filtro de Clientes) — contadas no
 * banco (A24 da 5ª simulação, 2026-11-02). Em `/admin/clients?unidade=` a
 * lista recortava a unidade e o contador seguia o da rede ("4 ativos").
 */
export async function getClientesAtivos(args: {
  tenantId: string; unidades: { id: string; name: string }[]
}): Promise<{ total: number; porUnidade: Record<string, number> }> {
  const admin = createAdminClient()
  const base = () => admin.from('clients').select('id', { count: 'exact', head: true })
    .eq('tenant_id', args.tenantId).eq('is_active', true)
  const [total, ...porUnidade] = await Promise.all([
    contar(base(), 'contar as clientes ativas'),
    ...args.unidades.map(u => contar(base().contains('tags', [unitTag(u.name)]), 'contar as clientes da unidade')),
  ])
  return { total, porUnidade: Object.fromEntries(args.unidades.map((u, i) => [u.id, porUnidade[i] ?? 0])) }
}
