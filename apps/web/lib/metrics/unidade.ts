import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas, contar } from '@/lib/db'
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
  /** A conta do preço médio, para a tela dizê-la (A39 da 9ª): a soma do preço dos cobrados e quantos. */
  receitaServico: number
  atendimentosCobrados: number
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
    receitaServico: Number(d?.receita_servico ?? 0),
    atendimentosCobrados: Number(d?.atendimentos_cobrados ?? 0),
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

/**
 * As clientes a reativar da REDE: sem visita em NENHUMA unidade desde `desde`,
 * com a unidade da última visita (quem nunca veio, sem unidade —
 * `metrics_clientes_para_reativar_rede`). A cliente é da rede (o Heitor, 24ª
 * simulação): não há "as clientes da unidade".
 */
export interface ClienteParaReativarDaRede {
  id: string; name: string; phone: string | null; ultimaVisita: string | null
  unidade: string | null; unidadeSlug: string | null
  /** A última visita é a do sistema de antes (a importada, F35). */
  antesDoSistema: boolean
  /**
   * O "Cliente desde" da importação (`clients.cliente_desde`, AAAA-MM-DD), ou
   * null. Sem visita, a linha diz isso em vez de "Nunca veio" (A14 da 43ª).
   */
  clienteDesde: string | null
}

export async function getClientesParaReativarDaRede(args: {
  tenantId: string; desde: Date; limite?: number
  /**
   * Quantas pular (a página seguinte do "Ver mais" do quadro — A18 da 43ª).
   * Só vai à função quando é mais que zero: a primeira página é a chamada de sempre.
   */
  deslocamento?: number
  /** "Só os meus": só as clientes dela (agendamento não cancelado com ela). */
  professionalId?: string | null
}): Promise<{ total: number; lista: ClienteParaReativarDaRede[]; comVisita: number; recentesSemVisita: number }> {
  const deslocamento = Math.max(0, Math.floor(args.deslocamento ?? 0))
  const data = await ler(createAdminClient().rpc('metrics_clientes_para_reativar_rede', {
    p_tenant: args.tenantId, p_desde: args.desde.toISOString(), p_limite: args.limite ?? 3,
    p_professional_id: args.professionalId ?? null,
    ...(deslocamento > 0 ? { p_deslocamento: deslocamento } : {}),
  }), 'buscar os clientes da rede para reativar')
  const d = (data ?? {}) as {
    total?: number; com_visita?: number; recentes_sem_visita?: number
    lista?: { id: string; name: string; phone: string | null; ultima_visita: string | null; unidade: string | null; unidade_slug: string | null; antes_do_sistema?: boolean }[]
  }
  // A14 da 43ª: o "Cliente desde" das que não têm visita nenhuma (a lista é
  // curta — o `p_limite` —, e só elas precisam dele).
  const semVisita = (d.lista ?? []).filter(c => !c.ultima_visita).map(c => c.id)
  const desdes = semVisita.length
    ? await ler(createAdminClient().from('clients').select('id, cliente_desde')
        .eq('tenant_id', args.tenantId).in('id', semVisita), 'ler o "cliente desde" das clientes a reativar') as { id: string; cliente_desde: string | null }[] | null
    : []
  const desdeDe = new Map((desdes ?? []).map(c => [c.id, c.cliente_desde ? String(c.cliente_desde).slice(0, 10) : null]))
  return {
    total: Number(d.total ?? 0),
    comVisita: Number(d.com_visita ?? 0), recentesSemVisita: Number(d.recentes_sem_visita ?? 0),
    lista: (d.lista ?? []).map(c => ({
      id: c.id, name: c.name, phone: c.phone, ultimaVisita: c.ultima_visita,
      unidade: c.unidade, unidadeSlug: c.unidade_slug, antesDoSistema: c.antes_do_sistema === true,
      clienteDesde: desdeDe.get(c.id) ?? null,
    })),
  }
}

/**
 * O "Reativar clientes" — a regra ÚNICA do dashboard (os dois portais) e do
 * Copilot (r3-f13-10, o Heitor em 2026-11-03: "os dois têm de dar a mesma
 * resposta"). A cliente é da REDE (o Heitor, 24ª simulação: "Novos clientes"
 * e o que conta clientes é da rede; a "atendida na unidade" de T1/H16 era
 * uma leitura do Claude, e saiu): a conta é sempre a da rede inteira — sem
 * visita em NENHUMA unidade —, em qualquer portal. A unidade do recorte não
 * estreita a lista; ela fica só no endereço da tela.
 * Na rede de uma unidade, dizer a unidade de cada uma é ruído (D-19).
 */
export async function getClientesParaReativarDoRecorte(args: {
  tenantId: string
  /** A unidade do recorte (a do portal, a do `?unidade=`, a do pedido). Não estreita: a cliente é da rede. */
  unidade?: { id: string; name: string } | null
  desde: Date; limite?: number
  /** Quantas pular: a página seguinte do "Ver mais" (A18 da 43ª). */
  deslocamento?: number
  /** "Só os meus" da agenda: as dela. */
  professionalId?: string | null
}): Promise<{ total: number; lista: ClienteParaReativarDaRede[]; comVisita: number; recentesSemVisita: number }> {
  const [umaSo, r] = await Promise.all([
    redeTemUmaUnidade(args.tenantId),
    getClientesParaReativarDaRede({
      tenantId: args.tenantId, desde: args.desde, limite: args.limite, deslocamento: args.deslocamento,
      professionalId: args.professionalId,
    }),
  ])
  return { ...r, lista: umaSo ? r.lista.map(c => ({ ...c, unidade: null, unidadeSlug: null })) : r.lista }
}

/**
 * As clientes ATIVAS da rede, contadas no banco (A24 da 5ª simulação,
 * 2026-11-02). A cliente é da rede (H16, Bloco Tags de 2026-11-14): não há
 * contador por unidade — a "Unidade: X" era tag, e saiu.
 */
export async function getClientesAtivos(args: { tenantId: string }): Promise<{ total: number }> {
  const total = await contar(createAdminClient().from('clients').select('id', { count: 'exact', head: true })
    .eq('tenant_id', args.tenantId).eq('is_active', true), 'contar as clientes ativas')
  return { total }
}
