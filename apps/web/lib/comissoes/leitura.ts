import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import {
  configDaLinha, linhasDaComissao, precoDaSessaoDePacote,
  type ConfigDeComissao, type RegraDeComissao, type TaxaDePagamento, type TipoDeRegra, type MetodoComTaxa,
  type ItemExecutado, type LinhaDeComissao,
} from './config'

/** A configuração de comissões da rede (os padrões, se ela nunca salvou). */
export async function configDeComissaoDaRede(tenantId: string): Promise<ConfigDeComissao> {
  const linha = await ler(createAdminClient().from('commission_configs')
    .select('modo, desconta_insumos, desconta_taxa, base_com_pontos, periodo')
    .eq('tenant_id', tenantId).maybeSingle(), 'ler a configuração de comissões')
  return configDaLinha(linha)
}

export async function taxasDaRede(tenantId: string): Promise<TaxaDePagamento[]> {
  const linhas = await ler(createAdminClient().from('payment_fees')
    .select('metodo, parcelas, taxa_pct').eq('tenant_id', tenantId)
    .order('metodo').order('parcelas'), 'ler as taxas da maquininha')
  return (linhas ?? []).map(l => ({ metodo: l.metodo as MetodoComTaxa, parcelas: l.parcelas as number, taxa_pct: Number(l.taxa_pct) }))
}

/**
 * Quem atende clientes (ativo) e não tem comissão PADRÃO: o atendimento dele
 * termina sem comissão, e a tela avisa. Só exceções não bastam — o
 * procedimento sem exceção cairia no nada.
 */
export async function profissionaisSemComissao(tenantId: string): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminClient()
  const [membros, padroes] = await Promise.all([
    ler(admin.from('users').select('id, name').eq('tenant_id', tenantId)
      .eq('provides_services', true).eq('is_active', true).order('name'), 'listar quem atende'),
    ler(admin.from('commission_rules').select('professional_id').eq('tenant_id', tenantId)
      .eq('is_active', true).is('procedure_id', null), 'listar as comissões padrão'),
  ])
  const comPadrao = new Set((padroes ?? []).map(p => p.professional_id as string))
  return (membros ?? []).filter(m => !comPadrao.has(m.id as string)).map(m => ({ id: m.id as string, nome: m.name as string }))
}

/**
 * Os procedimentos que podem virar exceção: o catálogo da rede e, para quem
 * tem unidade fixa, os locais da unidade; para quem é da rede, todos.
 */
export async function procedimentosParaComissao(tenantId: string, branchId: string | null): Promise<{ id: string; name: string }[]> {
  let q = createAdminClient().from('procedures').select('id, name')
    .eq('tenant_id', tenantId).eq('is_active', true)
  if (branchId) q = q.or(`branch_id.is.null,branch_id.eq.${branchId}`)
  const linhas = await ler(q.order('name'), 'listar os procedimentos')
  return (linhas ?? []).map(p => ({ id: p.id as string, name: p.name as string }))
}

/** As regras ativas de cada profissional da rede (padrão + exceções). */
export async function regrasDaRede(tenantId: string, profissionalId?: string): Promise<Map<string, RegraDeComissao[]>> {
  let q = createAdminClient().from('commission_rules')
    .select('professional_id, procedure_id, type, value')
    .eq('tenant_id', tenantId).eq('is_active', true)
  if (profissionalId) q = q.eq('professional_id', profissionalId)
  const linhas = await ler(q, 'ler as regras de comissão')
  const mapa = new Map<string, RegraDeComissao[]>()
  for (const l of linhas ?? []) {
    const lista = mapa.get(l.professional_id as string) ?? []
    lista.push({ procedure_id: (l.procedure_id as string | null) ?? null, tipo: l.type as TipoDeRegra, valor: Number(l.value) })
    mapa.set(l.professional_id as string, lista)
  }
  return mapa
}

/**
 * As linhas de comissão de um atendimento que está sendo concluído, com a base
 * de cada procedimento lida AQUI, no servidor:
 * - avulso: o preço do atendimento;
 * - sessão de plano: cada procedimento da sessão, com o preço dele no plano
 *   (antes a regra do primeiro procedimento valia sobre a sessão inteira);
 * - sessão de pacote: preço do pacote ÷ sessões (antes, o preço que o
 *   navegador mandou ao agendar).
 */
export async function linhasDoAtendimento(tenantId: string, appt: {
  id: string; procedure_id: string | null; professional_id: string; price: number; treatment_plan_id: string | null
}): Promise<LinhaDeComissao[]> {
  const admin = createAdminClient()
  const regras = (await regrasDaRede(tenantId, appt.professional_id)).get(appt.professional_id) ?? []
  if (!regras.length) return []

  if (appt.treatment_plan_id) {
    const sessao = await ler(admin.from('treatment_plan_sessions')
      .select('id, treatment_plan_session_procedures(procedure_id, price, sort_order)')
      .eq('plan_id', appt.treatment_plan_id).eq('appointment_id', appt.id).maybeSingle(), 'buscar a sessão do plano')
    const procs = ((sessao?.treatment_plan_session_procedures ?? []) as { procedure_id: string; price: number; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order)
    const itens: ItemExecutado[] = procs.length
      ? procs.map(p => ({ procedure_id: p.procedure_id, preco: Number(p.price) }))
      : [{ procedure_id: appt.procedure_id, preco: appt.price }]
    return linhasDaComissao(itens, regras, 'PLANO', appt.treatment_plan_id)
  }

  const sessaoDePacote = await ler(admin.from('package_sessions')
    .select('procedure_id, preco, client_packages!inner(price, total_sessions, service_packages!inner(price, total_sessions, procedure_id))')
    .eq('appointment_id', appt.id).maybeSingle(), 'buscar a sessão do pacote')
  const doCliente = sessaoDePacote?.client_packages as unknown as {
    price: number | null; total_sessions: number
    service_packages: { price: number; total_sessions: number; procedure_id: string | null } | null
  } | null
  const pacote = doCliente?.service_packages
  if (sessaoDePacote && doCliente && pacote) {
    // A parte do preço desta SESSÃO (rateio da venda, pelo preço de tabela de
    // cada procedimento). Vendido antes do rateio: preço da venda ÷ sessões; de
    // antes de existir venda: o do catálogo.
    const vendido = doCliente.price != null
    const preco = sessaoDePacote.preco != null
      ? Number(sessaoDePacote.preco)
      : precoDaSessaoDePacote(
          Number(vendido ? doCliente.price : pacote.price),
          Number(vendido ? doCliente.total_sessions : pacote.total_sessions),
        )
    return linhasDaComissao([{
      procedure_id: (sessaoDePacote.procedure_id as string | null) ?? pacote.procedure_id ?? appt.procedure_id,
      preco,
    }], regras, 'PACOTE', null)
  }

  // Procedimento pré-pago: a parte desta UNIDADE no preço vendido (o banco liga
  // a linha à venda na conclusão e libera na proporção do que a venda recebeu).
  const unidadePrePaga = await ler(admin.from('procedure_sale_units')
    .select('preco, procedure_sales!inner(procedure_id)')
    .eq('appointment_id', appt.id).eq('status', 'DISPONIVEL').maybeSingle(), 'buscar a unidade pré-paga')
  if (unidadePrePaga) {
    const venda = unidadePrePaga.procedure_sales as unknown as { procedure_id: string }
    return linhasDaComissao([{ procedure_id: venda.procedure_id, preco: Number(unidadePrePaga.preco) }], regras, 'PRE_PAGO', null)
  }

  return linhasDaComissao([{ procedure_id: appt.procedure_id, preco: appt.price }], regras, 'AVULSO', null)
}

// ─── A tela de comissões (Financeiro → Comissões) ────────────────────────────

export interface ResumoDoProfissional {
  professionalId: string; professionalName: string; branchId: string; branchName: string
  /** Lançado no período. */
  liberado: number
  /** Aberto e não fechado até o fim do período (inclui o que sobrou de antes). */
  aPagar: number
  /** Fechamentos pagos no período. */
  pago: number
}

export interface LancamentoDoExtrato {
  id: string; professionalId: string; branchId: string; releasedAt: string
  kind: 'LIBERACAO' | 'AJUSTE' | 'ESTORNO'; motivo: string | null; amount: number
  status: 'OPEN' | 'PAID'; payoutId: string | null
  appointmentId: string | null; scheduledAt: string | null
  cliente: string | null; procedimento: string | null; origem: string | null
  preco: number | null; regraTipo: string | null; regraValor: number | null
}

export interface Fechamento {
  id: string; professionalName: string; branchName: string
  inicio: string; fim: string; total: number; paidAt: string
  /** Estornado: a despesa voltou e os lançamentos, para "a pagar". */
  estornadoAt: string | null; estornoMotivo: string | null
}

interface Recorte { tenantId: string; branchIds: string[]; inicio: Date; fim: Date; profissionalId: string | null }

const argsDoRecorte = (r: Recorte) => ({
  p_tenant: r.tenantId, p_branch_ids: r.branchIds, p_inicio: r.inicio.toISOString(), p_fim: r.fim.toISOString(),
  p_profissional: r.profissionalId,
})

/** Por profissional e unidade, agregado no banco (§13.1). */
export async function resumoDasComissoes(r: Recorte): Promise<ResumoDoProfissional[]> {
  const linhas = await ler(createAdminClient().rpc('comissoes_resumo', argsDoRecorte(r)), 'ler o resumo das comissões')
  return ((linhas ?? []) as Record<string, unknown>[]).map(l => ({
    professionalId: String(l.professional_id), professionalName: String(l.professional_name),
    branchId: String(l.branch_id), branchName: String(l.branch_name),
    liberado: Number(l.liberado), aPagar: Number(l.a_pagar), pago: Number(l.pago),
  }))
}

/** O extrato do período e o que ainda está a pagar (até 2.000 lançamentos). */
export async function extratoDasComissoes(r: Recorte): Promise<LancamentoDoExtrato[]> {
  const linhas = await ler(createAdminClient().rpc('comissoes_extrato', argsDoRecorte(r)), 'ler o extrato das comissões')
  return ((linhas ?? []) as Record<string, unknown>[]).map(l => ({
    id: String(l.id), professionalId: String(l.professional_id), branchId: String(l.branch_id),
    releasedAt: String(l.released_at), kind: l.kind as LancamentoDoExtrato['kind'], motivo: (l.motivo as string | null) ?? null,
    amount: Number(l.amount), status: l.status as LancamentoDoExtrato['status'], payoutId: (l.payout_id as string | null) ?? null,
    appointmentId: (l.appointment_id as string | null) ?? null, scheduledAt: (l.scheduled_at as string | null) ?? null,
    cliente: (l.cliente as string | null) ?? null, procedimento: (l.procedimento as string | null) ?? null,
    origem: (l.origem as string | null) ?? null, preco: l.preco == null ? null : Number(l.preco),
    regraTipo: (l.regra_tipo as string | null) ?? null, regraValor: l.regra_valor == null ? null : Number(l.regra_valor),
  }))
}

/** Os últimos fechamentos no recorte. */
export async function fechamentosRecentes(tenantId: string, branchIds: string[], profissionalId: string | null): Promise<Fechamento[]> {
  let q = createAdminClient().from('commission_payouts')
    .select('id, inicio, fim, total, paid_at, estornado_at, estorno_motivo, users!commission_payouts_professional_id_fkey(name), branches(name)')
    .eq('tenant_id', tenantId).in('branch_id', branchIds)
    .order('paid_at', { ascending: false }).limit(20)
  if (profissionalId) q = q.eq('professional_id', profissionalId)
  const linhas = await ler(q, 'ler os fechamentos de comissão')
  return ((linhas ?? []) as unknown as {
    id: string; inicio: string; fim: string; total: number; paid_at: string
    estornado_at: string | null; estorno_motivo: string | null
    users: { name: string } | null; branches: { name: string } | null
  }[]).map(l => ({
    id: l.id, professionalName: l.users?.name ?? 'Profissional', branchName: l.branches?.name ?? '—',
    inicio: l.inicio, fim: l.fim, total: Number(l.total), paidAt: l.paid_at,
    estornadoAt: l.estornado_at, estornoMotivo: l.estorno_motivo,
  }))
}
