import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import {
  configDaLinha, linhasDaComissao, precoDaSessaoDePacote, comissaoDoPacoteDaLinha, regraDaSessaoDePacote,
  type ConfigDeComissao, type RegraDeComissao, type TipoDeRegra,
  type ItemExecutado, type LinhaDeComissao, type ComissoesGerais, type ComissaoDoProduto,
} from './config'

/** A configuração de comissões da rede (os padrões, se ela nunca salvou). */
export async function configDeComissaoDaRede(tenantId: string): Promise<ConfigDeComissao> {
  const linha = await ler(createAdminClient().from('commission_configs')
    .select('modo, desconta_insumos, desconta_taxa, base_com_pontos, periodo, produto_pct, produto_modo, plano_pct')
    .eq('tenant_id', tenantId).maybeSingle(), 'ler a configuração de comissões')
  return configDaLinha(linha)
}

/**
 * Os produtos de REVENDA da rede (ativos) e a comissão de venda de cada um
 * (r2-ven-10) — a lista da "Comissão por produto" de Configurações → Comissões.
 */
export async function comissoesDosProdutos(tenantId: string): Promise<ComissaoDoProduto[]> {
  const linhas = await lerTodas<Record<string, unknown>>((de, ate) => createAdminClient().from('products')
    .select('id, name, sale_price, comissao_tipo, comissao_valor')
    .eq('tenant_id', tenantId).eq('is_active', true).in('uso', ['REVENDA', 'AMBOS'])
    .order('name').order('id').range(de, ate), 'ler a comissão dos produtos')
  return (linhas ?? []).map(p => ({
    productId: String(p.id),
    nome:      String(p.name),
    preco:     Number(p.sale_price ?? 0),
    tipo:      p.comissao_tipo === 'PERCENTAGE' || p.comissao_tipo === 'FIXED_AMOUNT' ? p.comissao_tipo : null,
    valor:     p.comissao_valor == null ? null : Number(p.comissao_valor),
  }))
}

/**
 * Quem atende clientes (ativo) e não tem comissão PADRÃO: o atendimento dele
 * termina sem comissão, e a tela avisa. Só exceções não bastam — o
 * procedimento sem exceção cairia no nada.
 */
export async function profissionaisSemComissao(tenantId: string): Promise<{ id: string; nome: string }[] & { quantosAtendem?: number }> {
  const admin = createAdminClient()
  const [membros, padroes] = await Promise.all([
    ler(admin.from('users').select('id, name').eq('tenant_id', tenantId)
      .eq('provides_services', true).eq('is_active', true).order('name'), 'listar quem atende'),
    ler(admin.from('commission_rules').select('professional_id').eq('tenant_id', tenantId)
      .eq('is_active', true).is('procedure_id', null), 'listar as comissões padrão'),
  ])
  const comPadrao = new Set((padroes ?? []).map(p => p.professional_id as string))
  // Sem "de propósito" desde 2026-11-13 (o Heitor tirou a caixa): quem atende sem padrão fica no aviso.
  const sem = (membros ?? []).filter(m => !comPadrao.has(m.id as string))
    .map(m => ({ id: m.id as string, nome: m.name as string }))
  // A12 (5ª simulação): quantos atendem, para a tela não dizer "todos têm
  // comissão" quando ninguém atende.
  return Object.assign(sem, { quantosAtendem: (membros ?? []).length })
}

/**
 * Os procedimentos que podem virar exceção: o catálogo da rede e, para quem
 * tem unidade fixa, os locais da unidade; para quem é da rede, todos. O que
 * tem comissão GERAL fica de fora — é a mesma para todos, e muda no
 * procedimento.
 */
export async function procedimentosParaComissao(tenantId: string, branchId: string | null): Promise<{ id: string; name: string }[]> {
  let q = createAdminClient().from('procedures').select('id, name')
    .eq('tenant_id', tenantId).eq('is_active', true)
  if (branchId) q = q.or(`branch_id.is.null,branch_id.eq.${branchId}`)
  const [linhas, gerais] = await Promise.all([ler(q.order('name'), 'listar os procedimentos'), comissoesGeraisDaRede(tenantId)])
  return (linhas ?? []).filter(p => !gerais.has(p.id as string)).map(p => ({ id: p.id as string, name: p.name as string }))
}

/**
 * Os procedimentos com comissão GERAL — a que vale para todas e vence a regra
 * da profissional (`comissoes.md`). O modal da comissão de cada uma os lista,
 * com a regra (A11 da 10ª simulação: a Camila tinha 35% e não sabia que o
 * Microagulhamento pagava 40% "para todos").
 */
export async function procedimentosComComissaoGeral(tenantId: string, branchId: string | null): Promise<{ id: string; name: string; regra: Pick<RegraDeComissao, 'tipo' | 'valor'> }[]> {
  let q = createAdminClient().from('procedures').select('id, name')
    .eq('tenant_id', tenantId).eq('is_active', true)
  if (branchId) q = q.or(`branch_id.is.null,branch_id.eq.${branchId}`)
  const [linhas, gerais] = await Promise.all([ler(q.order('name').order('id'), 'listar os procedimentos'), comissoesGeraisDaRede(tenantId)])
  return (linhas ?? []).filter(p => gerais.has(p.id as string))
    .map(p => ({ id: p.id as string, name: p.name as string, regra: gerais.get(p.id as string)! }))
}

/** A comissão GERAL de cada procedimento (a mesma para todos), por procedimento. */
export async function comissoesGeraisDaRede(tenantId: string, procedimentos?: (string | null)[]): Promise<ComissoesGerais> {
  let q = createAdminClient().from('commission_rules').select('procedure_id, type, value')
    .eq('tenant_id', tenantId).eq('is_active', true).is('professional_id', null).not('procedure_id', 'is', null)
  if (procedimentos) {
    const ids = procedimentos.filter((p): p is string => !!p)
    if (!ids.length) return new Map()
    q = q.in('procedure_id', ids)
  }
  const linhas = await ler(q, 'ler as comissões gerais dos procedimentos')
  return new Map((linhas ?? []).map(l => [l.procedure_id as string, { tipo: l.type as TipoDeRegra, valor: Number(l.value) }]))
}

export interface ComissaoDosProcedimentos {
  gerais:        ComissoesGerais
  /** As exceções de cada procedimento: o valor de cada profissional. */
  porProfissional: Map<string, { professional_id: string; tipo: TipoDeRegra; valor: number }[]>
  /** Quem atende (e quem já tem valor em algum procedimento), com o padrão dele. */
  profissionais: { id: string; nome: string; padrao: RegraDeComissao | null }[]
}

/** Para Procedimentos: a geral e os valores por profissional de cada um. */
export async function comissaoDosProcedimentos(tenantId: string): Promise<ComissaoDosProcedimentos> {
  const admin = createAdminClient()
  const [gerais, regras, quemAtende] = await Promise.all([
    comissoesGeraisDaRede(tenantId),
    regrasDaRede(tenantId),
    ler(admin.from('users').select('id, name').eq('tenant_id', tenantId)
      .eq('provides_services', true).eq('is_active', true).order('name'), 'listar quem atende'),
  ])
  const porProfissional: ComissaoDosProcedimentos['porProfissional'] = new Map()
  for (const [profissional, lista] of regras) {
    for (const r of lista) {
      if (!r.procedure_id) continue
      const doProc = porProfissional.get(r.procedure_id) ?? []
      doProc.push({ professional_id: profissional, tipo: r.tipo, valor: r.valor })
      porProfissional.set(r.procedure_id, doProc)
    }
  }
  // Quem tem valor em algum procedimento entra mesmo sem atender hoje: a tela
  // substitui o conjunto inteiro do procedimento, e o valor dele não pode sumir
  // sem ninguém ver.
  const ids = new Set((quemAtende ?? []).map(u => u.id as string))
  const faltam = [...regras.keys()].filter(id => !ids.has(id) && regras.get(id)!.some(r => r.procedure_id))
  const outros = faltam.length
    ? await ler(admin.from('users').select('id, name').eq('tenant_id', tenantId).in('id', faltam), 'listar quem tem comissão')
    : []
  const profissionais = [...(quemAtende ?? []), ...(outros ?? [])]
    .map(u => ({ id: u.id as string, nome: u.name as string, padrao: regras.get(u.id as string)?.find(r => r.procedure_id === null) ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { gerais, porProfissional, profissionais }
}

/** As regras ativas de cada profissional da rede (padrão + exceções). */
export async function regrasDaRede(tenantId: string, profissionalId?: string): Promise<Map<string, RegraDeComissao[]>> {
  let q = createAdminClient().from('commission_rules')
    .select('professional_id, procedure_id, type, value')
    .eq('tenant_id', tenantId).eq('is_active', true).not('professional_id', 'is', null)
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
 * - sessão de pacote: a parte da sessão no rateio da venda (antes, o preço que o
 *   navegador mandou ao agendar), com a execução do PACOTE quando ele a diz
 *   (2026-10-30: % da sessão, valor fixo ou nenhuma; senão, a regra de sempre).
 */
export async function linhasDoAtendimento(tenantId: string, appt: {
  id: string; procedure_id: string | null; professional_id: string; price: number; treatment_plan_id: string | null
}): Promise<LinhaDeComissao[]> {
  const admin = createAdminClient()
  const regras = (await regrasDaRede(tenantId, appt.professional_id)).get(appt.professional_id) ?? []
  // A geral do procedimento vale para quem não tem regra nenhuma: lida
  // inteira (são poucas por rede), porque os procedimentos de uma sessão de
  // plano ou de pacote só se conhecem abaixo.
  const gerais = await comissoesGeraisDaRede(tenantId)
  const semRegraNenhuma = !regras.length && !gerais.size

  if (appt.treatment_plan_id) {
    if (semRegraNenhuma) return []
    const sessao = await ler(admin.from('treatment_plan_sessions')
      .select('id, treatment_plan_session_procedures(procedure_id, price, sort_order)')
      .eq('plan_id', appt.treatment_plan_id).eq('appointment_id', appt.id).maybeSingle(), 'buscar a sessão do plano')
    const procs = ((sessao?.treatment_plan_session_procedures ?? []) as { procedure_id: string; price: number; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order)
    const itens: ItemExecutado[] = procs.length
      ? procs.map(p => ({ procedure_id: p.procedure_id, preco: Number(p.price) }))
      : [{ procedure_id: appt.procedure_id, preco: appt.price }]
    return linhasDaComissao(itens, regras, 'PLANO', appt.treatment_plan_id, gerais)
  }

  // A sessão de pacote vem antes do "sem regra nenhuma": o PACOTE pode dizer a
  // comissão da execução (2026-10-30), valendo para quem não tem regra.
  const sessaoDePacote = await ler(admin.from('package_sessions')
    .select('procedure_id, preco, client_packages!inner(price, total_sessions, comissao_execucao, comissao_execucao_valor, de_fora, service_packages!inner(price, total_sessions, procedure_id))')
    .eq('appointment_id', appt.id).maybeSingle(), 'buscar a sessão do pacote')
  const doCliente = sessaoDePacote?.client_packages as unknown as {
    price: number | null; total_sessions: number; comissao_execucao: string | null; comissao_execucao_valor: number | null
    de_fora?: boolean
    service_packages: { price: number; total_sessions: number; procedure_id: string | null } | null
  } | null
  const pacote = doCliente?.service_packages
  if (sessaoDePacote && doCliente && pacote) {
    // O pacote trazido de fora (F35) sem valor de referência: a sessão não tem
    // valor, e a comissão de execução é R$ 0 (princípio 4 — não se chuta o
    // valor de outro pacote; decisão 1 do Heitor).
    if (doCliente.de_fora && sessaoDePacote.preco == null) return []
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
    const procedimento = (sessaoDePacote.procedure_id as string | null) ?? pacote.procedure_id ?? appt.procedure_id
    // A execução é a do RETRATO da venda (mudar o catálogo vale para as próximas).
    const { execucao } = comissaoDoPacoteDaLinha(doCliente)
    const regra = regraDaSessaoDePacote(execucao, regras, procedimento, gerais)
    if (!regra) return []
    return [{
      procedure_id: procedimento, origem: 'PACOTE', treatment_plan_id: null,
      regra_tipo: regra.tipo, regra_valor: regra.valor, preco: Math.max(0, Math.round(preco * 100) / 100),
    }]
  }
  if (semRegraNenhuma) return []

  // Procedimento pré-pago: a parte desta UNIDADE no preço vendido (o banco liga
  // a linha à venda na conclusão e libera quando a venda estiver paga inteira — H4, 2026-11-01).
  const unidadePrePaga = await ler(admin.from('procedure_sale_units')
    .select('preco, procedure_sales!inner(procedure_id)')
    .eq('appointment_id', appt.id).eq('status', 'DISPONIVEL').maybeSingle(), 'buscar a unidade pré-paga')
  if (unidadePrePaga) {
    const venda = unidadePrePaga.procedure_sales as unknown as { procedure_id: string }
    return linhasDaComissao([{ procedure_id: venda.procedure_id, preco: Number(unidadePrePaga.preco) }], regras, 'PRE_PAGO', null, gerais)
  }

  return linhasDaComissao([{ procedure_id: appt.procedure_id, preco: appt.price }], regras, 'AVULSO', null, gerais)
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
  /**
   * O que vai dever quando a cliente pagar TUDO (H4, 2026-11-01): fora do a
   * pagar e do fechamento. Inclui o que nasceu antes do período.
   */
  aguardando: number
}

export interface LancamentoDoExtrato {
  id: string; professionalId: string; branchId: string; releasedAt: string
  /** AGUARDANDO: a linha que espera o pagamento integral — não é lançamento (valor 0; o previsto ao lado). */
  kind: 'LIBERACAO' | 'AJUSTE' | 'ESTORNO' | 'AGUARDANDO'; motivo: string | null; amount: number
  status: 'OPEN' | 'PAID' | 'AGUARDANDO'; payoutId: string | null
  appointmentId: string | null; scheduledAt: string | null
  cliente: string | null; procedimento: string | null; origem: string | null
  preco: number | null; regraTipo: string | null; regraValor: number | null
  /** O pacote da linha (a venda ou a sessão dele), quando é de pacote. */
  pacote: string | null
  /** O que saiu da base desta linha (o retrato dela) — J-46. */
  descontaTaxa: boolean; descontaInsumos: boolean
  /** Na linha AGUARDANDO: quanto ela vai dever quando a cliente pagar tudo. */
  previsto: number | null
  /** Se os pontos (e o voucher) saem da base desta linha — o retrato dela (A10 da 7ª). */
  baseComPontos: 'PRECO' | 'VALOR_PAGO' | null
  /** O plano da linha, quando é a VENDA do plano (decisão 4 da 7ª). */
  plano: string | null
  /**
   * A base EFETIVA que a conta usou (base × regra = previsto) e o que saiu do
   * preço até ela — D3 da 10ª: o extrato mostrava o preço onde dizia base.
   */
  base: number | null; baseDesconto: number; baseTaxa: number; baseInsumos: number; baseFator: number
  /**
   * Quando o lançamento foi pago (o dia do fechamento dele); nulo a pagar. A21
   * da 10ª: com o pagamento parcial, o extrato diz por lançamento o que foi pago
   * e o que ficou.
   */
  pagoEm: string | null
  /**
   * A17 da 11ª: de onde veio o percentual da comissão de venda — do item
   * (pacote, produto), da pessoa ou da clínica; nulo nas linhas de antes e na
   * execução.
   */
  regraDe: 'ITEM' | 'PESSOA' | 'CLINICA' | null
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
    liberado: Number(l.liberado), aPagar: Number(l.a_pagar), pago: Number(l.pago), aguardando: Number(l.aguardando ?? 0),
  }))
}

/**
 * O extrato do período e o que ainda está a pagar — inteiro, em páginas
 * (2026-10-22). A função tinha teto de 2000, e o PostgREST cortava em 1000.
 */
export async function extratoDasComissoes(r: Recorte): Promise<LancamentoDoExtrato[]> {
  const admin = createAdminClient()
  const linhas = await lerTodas<Record<string, unknown>>(
    // A17 da 11ª: o extrato com a origem da regra (o de antes ficou sem chamador).
    (de, ate) => admin.rpc('comissoes_extrato_com_regra', argsDoRecorte(r))
      .order('released_at', { ascending: false }).order('id').range(de, ate),
    'ler o extrato das comissões',
  )
  const pagoEm = await diasDosFechamentos(r.tenantId, linhas.map(l => (l.payout_id as string | null) ?? null))
  return linhas.map(l => ({
    id: String(l.id), professionalId: String(l.professional_id), branchId: String(l.branch_id),
    releasedAt: String(l.released_at), kind: l.kind as LancamentoDoExtrato['kind'], motivo: (l.motivo as string | null) ?? null,
    amount: Number(l.amount), status: l.status as LancamentoDoExtrato['status'], payoutId: (l.payout_id as string | null) ?? null,
    appointmentId: (l.appointment_id as string | null) ?? null, scheduledAt: (l.scheduled_at as string | null) ?? null,
    cliente: (l.cliente as string | null) ?? null, procedimento: (l.procedimento as string | null) ?? null,
    origem: (l.origem as string | null) ?? null, preco: l.preco == null ? null : Number(l.preco),
    regraTipo: (l.regra_tipo as string | null) ?? null, regraValor: l.regra_valor == null ? null : Number(l.regra_valor),
    pacote: (l.pacote as string | null) ?? null,
    descontaTaxa: l.desconta_taxa === true, descontaInsumos: l.desconta_insumos === true,
    previsto: l.previsto == null ? null : Number(l.previsto),
    baseComPontos: l.base_com_pontos === 'VALOR_PAGO' ? 'VALOR_PAGO' : l.base_com_pontos === 'PRECO' ? 'PRECO' : null,
    plano: (l.plano as string | null) ?? null,
    base: l.base == null ? null : Number(l.base),
    baseDesconto: Number(l.base_desconto ?? 0), baseTaxa: Number(l.base_taxa ?? 0), baseInsumos: Number(l.base_insumos ?? 0),
    baseFator: l.base_fator == null ? 1 : Number(l.base_fator),
    pagoEm: l.status === 'PAID' && l.payout_id ? pagoEm.get(String(l.payout_id)) ?? null : null,
    regraDe: l.regra_de === 'ITEM' || l.regra_de === 'PESSOA' || l.regra_de === 'CLINICA' ? l.regra_de : null,
  }))
}

/** O dia em que cada fechamento foi pago, pelo id (em lotes: a lista de ids vai na URL). */
async function diasDosFechamentos(tenantId: string, ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))]
  const mapa = new Map<string, string>()
  for (let i = 0; i < unicos.length; i += 150) {
    const lote = await ler(createAdminClient().from('commission_payouts').select('id, paid_at')
      .eq('tenant_id', tenantId).in('id', unicos.slice(i, i + 150)), 'ler quando os fechamentos foram pagos')
    for (const f of (lote ?? []) as { id: string; paid_at: string }[]) mapa.set(f.id, f.paid_at)
  }
  return mapa
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
