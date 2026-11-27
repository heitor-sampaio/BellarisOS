import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { lerRegrasDoPacote, recusaDaSessaoNaoLiberada, recusaDaSessaoNaoLiberadaNoApp } from '@/lib/pacotes/regras'
import { creditoValeHoje, recusaDaValidadeDoCredito } from '@/lib/creditos/validade'
import { dayKeyTZ } from '@/lib/datetime'
import { fusoValido } from '@/lib/unidades/fuso'

/**
 * Agendar usando o que o cliente JÁ PAGOU (fase 3 de "Vender", 2026-09-30):
 * uma unidade de procedimento pré-pago (`procedure_sale_units`) ou uma sessão
 * de pacote (`package_sessions`). O crédito decide o procedimento e o preço do
 * agendamento, e fica ligado a ele (`appointment_id`) — é essa ligação que faz
 * a conclusão usar o crédito, a recepção não cobrar e a comissão sair da venda.
 *
 * Mora fora de `actions/` (todo export de lá é endpoint). O núcleo do
 * agendamento (`createAppointmentCore`) é quem usa: agenda, inbox e a ficha
 * passam por ele, com conflito de horário, histórico e evento.
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * `PLANO` (A18 e D5 da 9ª simulação, 2026-11-07): a sessão LIVRE de um plano
 * fechado — "os dois são, em essencia, conjuntos de procedimentos" (decisão 2
 * do Heitor). Ela decide o procedimento (o primeiro da sessão), o preço (a soma
 * dos procedimentos dela no plano, com o desconto) e a DURAÇÃO (a soma das
 * durações): o modal das sessões mandava o preço e a duração da sessão vizinha.
 */
export type TipoDeCredito = 'PRE_PAGO' | 'PACOTE' | 'PLANO'
export interface CreditoDeAgendamento { tipo: TipoDeCredito; id: string }

const UUID = /^[0-9a-f-]{36}$/i
const TIPOS: readonly string[] = ['PRE_PAGO', 'PACOTE', 'PLANO']

/** "PRE_PAGO:<id>" (do formulário) ou { tipo, id } → o crédito, ou null. */
export function lerCredito(v: unknown): CreditoDeAgendamento | null {
  if (typeof v === 'string') {
    const [tipo, id] = v.split(':')
    return tipo && TIPOS.includes(tipo) && id && UUID.test(id) ? { tipo: tipo as TipoDeCredito, id } : null
  }
  if (v && typeof v === 'object') {
    const { tipo, id } = v as Record<string, unknown>
    return typeof tipo === 'string' && TIPOS.includes(tipo) && typeof id === 'string' && UUID.test(id) ? { tipo: tipo as TipoDeCredito, id } : null
  }
  return null
}

/** O que a sessão de um plano vale para o agendamento: o procedimento principal, o preço e a duração dela. */
export interface ValoresDaSessaoDoPlano { procedureId: string; preco: number; duracaoMin: number }

/**
 * A sessão do plano → os valores do agendamento dela (pura): o PRIMEIRO
 * procedimento (pela ordem), a soma dos preços no plano (em centavos) e a soma
 * das durações (60 min no procedimento sem duração) — a conta do checkout
 * (`getTreatmentPlanSessions`).
 */
export function valoresDaSessaoDoPlano(
  procs: { procedure_id: string; price: number | string | null; sort_order: number | null; duracao: number | null }[],
): ValoresDaSessaoDoPlano | null {
  const ordem = [...procs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  if (!ordem[0]) return null
  return {
    procedureId: ordem[0].procedure_id,
    preco:       Math.round(ordem.reduce((t, p) => t + Number(p.price ?? 0) * 100, 0)) / 100,
    duracaoMin:  ordem.reduce((t, p) => t + (p.duracao ?? 60), 0),
  }
}

/**
 * Confere que o crédito é DESTE cliente, da rede, livre (sem agendamento) e
 * dentro da validade; devolve o procedimento e o preço dele (e, na sessão do
 * plano, a duração e o plano).
 *
 * A validade (PP-05; decisões do Claude, 27/11 — A3 e A6 da 37ª): vale o DIA
 * MARCADO da sessão (`quando`; sem ele, hoje), e a validade é um dia no fuso
 * da unidade do crédito (`recusaDaValidadeDoCredito`).
 */
export async function conferirCredito(
  admin: Admin, tenantId: string, clientId: string, c: CreditoDeAgendamento,
  /** `paraACliente`: o agendar do app (a recusa da sessão presa fala com ela — A5 da 37ª). */
  opcoes: { quando?: string | null; fusoDoDia?: string | null; paraACliente?: boolean } = {},
): Promise<{ procedureId: string; preco: number; duracaoMin?: number; planoId?: string } | { error: string }> {
  if (c.tipo === 'PLANO') {
    const s = await ler(admin.from('treatment_plan_sessions')
      .select('appointment_id, plan_id, treatment_plans!inner(status, client_id, branches!inner(tenant_id)), treatment_plan_session_procedures(procedure_id, price, sort_order, procedures(duration_min))')
      .eq('id', c.id).maybeSingle(), 'buscar a sessão do plano')
    const tp = s?.treatment_plans as unknown as { status: string; client_id: string | null; branches: { tenant_id: string } } | undefined
    if (!s || tp?.branches.tenant_id !== tenantId || tp.client_id !== clientId) return { error: 'Crédito não encontrado para este cliente.' }
    if (tp.status !== 'ACCEPTED') return { error: 'Este plano não está em andamento: a sessão não se agenda.' }
    if (s.appointment_id) return { error: 'Esta sessão já foi feita ou agendada.' }
    type P = { procedure_id: string; price: number; sort_order: number; procedures: { duration_min: number | null } | null }
    const v = valoresDaSessaoDoPlano(((s.treatment_plan_session_procedures ?? []) as unknown as P[])
      .map(p => ({ procedure_id: p.procedure_id, price: p.price, sort_order: p.sort_order, duracao: p.procedures?.duration_min ?? null })))
    if (!v) return { error: 'A sessão do plano não tem procedimento.' }
    return { ...v, planoId: s.plan_id as string }
  }
  if (c.tipo === 'PRE_PAGO') {
    const u = await ler(admin.from('procedure_sale_units')
      .select('status, appointment_id, preco, procedure_sales!inner(tenant_id, client_id, procedure_id, expires_at, branches(fuso))')
      .eq('id', c.id).maybeSingle(), 'buscar a unidade pré-paga')
    const venda = u?.procedure_sales as unknown as { tenant_id: string; client_id: string; procedure_id: string; expires_at: string | null; branches?: { fuso?: string | null } | null } | undefined
    if (!u || venda?.tenant_id !== tenantId || venda.client_id !== clientId) return { error: 'Crédito não encontrado para este cliente.' }
    if (u.status !== 'DISPONIVEL' || u.appointment_id) return { error: 'Este crédito já foi usado ou agendado.' }
    const vencido = recusaDaValidadeDoCredito({ tipo: 'pré-pago', expiresAt: venda.expires_at, fuso: venda.branches?.fuso, quando: opcoes.quando, fusoDoDia: opcoes.fusoDoDia })
    if (vencido) return { error: vencido }
    return { procedureId: venda.procedure_id, preco: Number(u.preco) }
  }
  const s = await ler(admin.from('package_sessions')
    .select('status, appointment_id, procedure_id, preco, client_package_id, client_packages!inner(client_id, price, total_sessions, expires_at, branches!inner(tenant_id, fuso), service_packages(procedure_id, price, total_sessions))')
    .eq('id', c.id).maybeSingle(), 'buscar a sessão do pacote')
  const cp = s?.client_packages as unknown as {
    client_id: string; price: number | null; total_sessions: number; expires_at: string | null
    branches: { tenant_id: string; fuso?: string | null }; service_packages: { procedure_id: string | null; price: number; total_sessions: number } | null
  } | undefined
  if (!s || cp?.branches.tenant_id !== tenantId || cp.client_id !== clientId) return { error: 'Crédito não encontrado para este cliente.' }
  if (s.status !== 'AVAILABLE' || s.appointment_id) return { error: 'Esta sessão já foi usada ou agendada.' }
  const vencido = recusaDaValidadeDoCredito({ tipo: 'pacote', expiresAt: cp.expires_at, fuso: cp.branches.fuso, quando: opcoes.quando, fusoDoDia: opcoes.fusoDoDia })
  if (vencido) return { error: vencido }
  // Item 8 da auditoria (decisão do Claude pelo princípio 1, 2026-11-18): a
  // rede que libera as sessões do pacote no crediário só depois de pago. Todo
  // caminho que agenda ou usa a sessão passa por aqui (o núcleo do agendamento
  // — a equipe e o app —, o Copilot e o "Abater do pacote"); o banco confere
  // de novo (`private.pacote_sessao_liberada`).
  const regras = lerRegrasDoPacote(await ler(admin.from('tenants')
    .select('pacote_crediario_libera, pacote_vencido_cancela').eq('id', tenantId).maybeSingle(), 'ler as regras do pacote da rede'))
  if (!regras.crediarioLibera) {
    const { data, error } = await admin.rpc('metrics_em_aberto_dos_pacotes', { p_tenant: tenantId, p_pacotes: [s.client_package_id as string] })
    if (error) throw new Error(`Não consegui ler o em aberto do pacote: ${error.message}`)
    const emAberto = Number(((data ?? []) as { em_aberto: number | string }[])[0]?.em_aberto ?? 0)
    // A5 da 37ª: no app, a recusa fala com a cliente.
    const recusa = opcoes.paraACliente ? recusaDaSessaoNaoLiberadaNoApp(regras, emAberto) : recusaDaSessaoNaoLiberada(regras, emAberto)
    if (recusa) return { error: recusa }
  }
  const procedureId = (s.procedure_id as string | null) ?? cp.service_packages?.procedure_id ?? null
  if (!procedureId) return { error: 'A sessão do pacote não tem procedimento.' }
  // A parte da sessão no rateio da venda; pacote de antes do rateio: preço ÷ sessões.
  const preco = s.preco != null
    ? Number(s.preco)
    : Math.round(Number(cp.price ?? cp.service_packages?.price ?? 0) * 100 / Math.max(1, cp.total_sessions)) / 100
  return { procedureId, preco }
}

/**
 * Liga o crédito ao agendamento, só se ainda estiver livre (compare-and-swap:
 * dois agendamentos ao mesmo tempo não usam o mesmo crédito). Devolve se ligou.
 */
export async function ligarCredito(admin: Admin, c: CreditoDeAgendamento, appointmentId: string): Promise<boolean> {
  if (c.tipo === 'PLANO') {
    const { data, error } = await admin.from('treatment_plan_sessions')
      .update({ appointment_id: appointmentId })
      .eq('id', c.id).is('appointment_id', null)
      .select('id')
    if (error) throw new Error(`Erro ao ligar a sessão do plano: ${error.message}`)
    return (data ?? []).length > 0
  }
  const tabela = c.tipo === 'PRE_PAGO' ? 'procedure_sale_units' : 'package_sessions'
  const livre = c.tipo === 'PRE_PAGO' ? 'DISPONIVEL' : 'AVAILABLE'
  const { data, error } = await admin.from(tabela)
    .update({ appointment_id: appointmentId })
    .eq('id', c.id).eq('status', livre).is('appointment_id', null)
    .select('id')
  if (error) throw new Error(`Erro ao ligar o crédito: ${error.message}`)
  return (data ?? []).length > 0
}

/**
 * PP-05 (decisão do Claude, 27/11 — A3 da 37ª): o crédito JÁ LIGADO ao
 * agendamento (a sessão do pacote, a do pré-pago) não vai para depois da
 * validade — a remarcação confere o dia novo. Sem crédito ligado, nada.
 */
export async function recusaDoCreditoDoAgendamento(
  admin: Admin, appointmentId: string, quando: string, fusoDoDia?: string | null,
): Promise<string | null> {
  const [sessoes, unidades] = await Promise.all([
    ler(admin.from('package_sessions').select('client_packages(expires_at, branches(fuso))')
      .eq('appointment_id', appointmentId).eq('status', 'AVAILABLE').limit(1), 'conferir a validade da sessão do pacote'),
    ler(admin.from('procedure_sale_units').select('procedure_sales(expires_at, branches(fuso))')
      .eq('appointment_id', appointmentId).eq('status', 'DISPONIVEL').limit(1), 'conferir a validade do pré-pago'),
  ])
  type V = { expires_at: string | null; branches?: { fuso?: string | null } | null } | null
  const pacote = ((sessoes ?? []) as unknown as { client_packages: V }[])[0]?.client_packages
  if (pacote) {
    const r = recusaDaValidadeDoCredito({ tipo: 'pacote', expiresAt: pacote.expires_at, fuso: pacote.branches?.fuso, quando, fusoDoDia })
    if (r) return r
  }
  const venda = ((unidades ?? []) as unknown as { procedure_sales: V }[])[0]?.procedure_sales
  if (venda) return recusaDaValidadeDoCredito({ tipo: 'pré-pago', expiresAt: venda.expires_at, fuso: venda.branches?.fuso, quando, fusoDoDia })
  return null
}

/** PP-05 (A3 da 37ª): o crédito escolhido serve a uma sessão marcada em `quando`? (O "Usar o pacote" num avulso já marcado.) */
export async function recusaDoCreditoNoDia(
  admin: Admin, c: CreditoDeAgendamento, quando: string, fusoDoDia?: string | null,
): Promise<string | null> {
  type V = { expires_at: string | null; branches?: { fuso?: string | null } | null } | null
  if (c.tipo === 'PRE_PAGO') {
    const u = await ler(admin.from('procedure_sale_units').select('procedure_sales(expires_at, branches(fuso))').eq('id', c.id).maybeSingle(), 'conferir a validade do pré-pago')
    const v = (u as unknown as { procedure_sales: V } | null)?.procedure_sales
    return v ? recusaDaValidadeDoCredito({ tipo: 'pré-pago', expiresAt: v.expires_at, fuso: v.branches?.fuso, quando, fusoDoDia }) : null
  }
  if (c.tipo === 'PACOTE') {
    const s = await ler(admin.from('package_sessions').select('client_packages(expires_at, branches(fuso))').eq('id', c.id).maybeSingle(), 'conferir a validade da sessão do pacote')
    const p = (s as unknown as { client_packages: V } | null)?.client_packages
    return p ? recusaDaValidadeDoCredito({ tipo: 'pacote', expiresAt: p.expires_at, fuso: p.branches?.fuso, quando, fusoDoDia }) : null
  }
  return null
}

export interface CreditoParaAgendar {
  tipo:         TipoDeCredito
  /** A próxima unidade/sessão livre deste grupo — é ela que o agendamento usa. */
  id:           string
  procedureId:  string
  procedimento: string
  /** "Pré-pago" ou o nome do pacote. */
  origem:       string
  preco:        number
  restantes:    number
  venceEm:      string | null
  /** O número da sessão/unidade que o agendamento vai usar e o total da venda ("sessão 2 de 3", D10 da 8ª). */
  numero?:      number
  total?:       number
  /** A duração do agendamento, quando não é a do procedimento (a sessão do plano: a soma da sessão). */
  duracaoMin?:  number
  /**
   * PA-14 (D15 da 31ª): o que ainda está em aberto do PACOTE desta sessão — só
   * a quem recebe (`veOEmAberto`). O agendar mostra o `AvisoDoPacoteEmAberto`
   * com ele (a unidade do pacote é o PDV das parcelas).
   */
  emAberto?:    { valor: number; parcelas: number; unidadeId: string | null; liberaAsSessoes: boolean } | null
  /** PA-13: a rede libera só depois de pago e o pacote tem valor em aberto — a sessão não se agenda (o porquê). */
  recusa?:      string | null
}

/**
 * O que o cliente tem para agendar: por venda de pré-pago e por procedimento
 * de cada pacote, a próxima unidade/sessão livre (sem agendamento e dentro da
 * validade) e quantas restam.
 *
 * D15 da 31ª (PA-13, PA-14): a sessão do pacote com valor em aberto diz o que
 * falta (`emAberto`, a quem recebe — `veOEmAberto`) e, na rede que libera só
 * depois de pago, por que não se agenda (`recusa`, a mesma de `conferirCredito`).
 */
export async function creditosDoCliente(
  admin: Admin, tenantId: string, clientId: string, opcoes: { veOEmAberto?: boolean } = {},
): Promise<CreditoParaAgendar[]> {
  // A6 da 37ª (decisão do Claude, 27/11): a validade é um DIA, no fuso da unidade do crédito.
  const agora = new Date()
  const valido = (vence: string | null, fuso: string | null | undefined) => creditoValeHoje(vence, fusoValido(fuso), agora)
  const [vendas, pacotes, planos] = await Promise.all([
    ler(admin.from('procedure_sales')
      .select('procedure_id, expires_at, sold_at, branches(fuso), procedures(name), procedure_sale_units(id, numero, preco, status, appointment_id)')
      .eq('tenant_id', tenantId).eq('client_id', clientId).order('sold_at'), 'buscar os pré-pagos do cliente'),
    ler(admin.from('client_packages')
      .select('id, branch_id, expires_at, price, total_sessions, purchased_at, branches!inner(tenant_id, fuso), service_packages(name, procedure_id), package_sessions(id, session_number, procedure_id, preco, status, appointment_id, procedures(name))')
      .eq('client_id', clientId).eq('branches.tenant_id', tenantId).order('purchased_at'), 'buscar os pacotes do cliente'),
    // A18 da 9ª: as sessões livres dos planos FECHADOS (o "+ Agendar" da ficha as oferecia só pelo cartão do tratamento).
    ler(admin.from('treatment_plans')
      .select('id, created_at, branches!inner(tenant_id), treatment_plan_sessions(id, sort_order, appointment_id, treatment_plan_session_procedures(procedure_id, price, sort_order, procedures(name, duration_min)))')
      .eq('client_id', clientId).eq('status', 'ACCEPTED').eq('branches.tenant_id', tenantId).order('created_at'), 'buscar os planos do cliente'),
  ])
  // D3 da 37ª (PP-07; decisão do Claude, 27/11 — A1): o pacote e o pré-pago em
  // UMA ordem, o mais antigo pela compra primeiro, qualquer tipo (o pacote de
  // antes conta pela data em que foi registrado); empatando o dia, o que vence
  // antes. O modal e o app escolhem o primeiro do procedimento. A sessão do
  // plano segue depois (é a do plano, e o app a escolhe à parte).
  const comprados: { c: CreditoParaAgendar; compra: string; dia: string }[] = []
  const diaDaCompra = (iso: string | null | undefined, fuso: string | null | undefined) => iso ? dayKeyTZ(iso, fusoValido(fuso)) : ''

  type U = { id: string; numero: number; preco: number; status: string; appointment_id: string | null }
  for (const v of (vendas ?? []) as unknown as { procedure_id: string; expires_at: string | null; sold_at?: string | null; branches?: { fuso?: string | null } | null; procedures: { name: string } | null; procedure_sale_units: U[] }[]) {
    if (!valido(v.expires_at, v.branches?.fuso)) continue
    const livres = (v.procedure_sale_units ?? []).filter(u => u.status === 'DISPONIVEL' && !u.appointment_id).sort((a, b) => a.numero - b.numero)
    if (!livres.length) continue
    comprados.push({ compra: v.sold_at ?? '', dia: diaDaCompra(v.sold_at, v.branches?.fuso), c: {
      tipo: 'PRE_PAGO', id: livres[0]!.id, procedureId: v.procedure_id, procedimento: v.procedures?.name ?? 'Procedimento',
      origem: 'Pré-pago', preco: Number(livres[0]!.preco), restantes: livres.length, venceEm: v.expires_at,
      numero: livres[0]!.numero, total: (v.procedure_sale_units ?? []).length,
    } })
  }

  type S = { id: string; session_number: number; procedure_id: string | null; preco: number | null; status: string; appointment_id: string | null; procedures: { name: string } | null }
  for (const p of (pacotes ?? []) as unknown as {
    id: string; branch_id?: string | null; expires_at: string | null; price: number | null; total_sessions: number; purchased_at?: string | null
    branches?: { fuso?: string | null } | null
    service_packages: { name: string; procedure_id: string | null } | null; package_sessions: S[]
  }[]) {
    if (!valido(p.expires_at, p.branches?.fuso)) continue
    const livres = (p.package_sessions ?? []).filter(s => s.status === 'AVAILABLE' && !s.appointment_id).sort((a, b) => a.session_number - b.session_number)
    const porProcedimento = new Map<string, S[]>()
    for (const s of livres) {
      const proc = s.procedure_id ?? p.service_packages?.procedure_id
      if (!proc) continue
      porProcedimento.set(proc, [...(porProcedimento.get(proc) ?? []), s])
    }
    for (const [procedureId, sessoes] of porProcedimento) {
      const primeira = sessoes[0]!
      comprados.push({ compra: p.purchased_at ?? '', dia: diaDaCompra(p.purchased_at, p.branches?.fuso), c: {
        tipo: 'PACOTE', id: primeira.id, procedureId, procedimento: primeira.procedures?.name ?? 'Procedimento',
        origem: p.service_packages?.name ?? 'Pacote',
        preco: primeira.preco != null ? Number(primeira.preco) : Math.round(Number(p.price ?? 0) * 100 / Math.max(1, p.total_sessions)) / 100,
        restantes: sessoes.length, venceEm: p.expires_at,
        numero: primeira.session_number, total: p.total_sessions,
        pacoteId: p.id, unidadeDoPacote: p.branch_id ?? null,
      } as CreditoParaAgendar & { pacoteId: string; unidadeDoPacote?: string | null } })
    }
  }
  // Sem validade vence "por último"; o desempate final é o instante da compra (e a ordem lida).
  const vence = (c: CreditoParaAgendar) => c.venceEm ? new Date(c.venceEm).getTime() : Number.POSITIVE_INFINITY
  const saida: CreditoParaAgendar[] = comprados
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || vence(a.c) - vence(b.c) || a.compra.localeCompare(b.compra) || a.i - b.i)
    .map(x => x.c)
  await comOEmAbertoDosPacotes(admin, tenantId, saida as (CreditoParaAgendar & { pacoteId?: string; unidadeDoPacote?: string | null })[], opcoes.veOEmAberto === true)

  // Os planos: por procedimento principal, a próxima sessão livre (a ordem do plano).
  type SP = { procedure_id: string; price: number; sort_order: number; procedures: { name: string; duration_min: number | null } | null }
  type SS = { id: string; sort_order: number; appointment_id: string | null; treatment_plan_session_procedures: SP[] }
  for (const pl of (planos ?? []) as unknown as { id: string; treatment_plan_sessions: SS[] }[]) {
    const todas = [...(pl.treatment_plan_sessions ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    const porProcedimento = new Map<string, { s: SS; numero: number; v: ValoresDaSessaoDoPlano; nome: string }[]>()
    todas.forEach((s, i) => {
      if (s.appointment_id) return
      const procs = s.treatment_plan_session_procedures ?? []
      const v = valoresDaSessaoDoPlano(procs.map(p => ({ procedure_id: p.procedure_id, price: p.price, sort_order: p.sort_order, duracao: p.procedures?.duration_min ?? null })))
      if (!v) return
      const nomes = [...procs].sort((a, b) => a.sort_order - b.sort_order).map(p => p.procedures?.name ?? 'Procedimento')
      porProcedimento.set(v.procedureId, [...(porProcedimento.get(v.procedureId) ?? []), { s, numero: i + 1, v, nome: [...new Set(nomes)].join(' + ') }])
    })
    for (const [procedureId, livres] of porProcedimento) {
      const primeira = livres[0]!
      saida.push({
        tipo: 'PLANO', id: primeira.s.id, procedureId, procedimento: primeira.nome,
        origem: 'Plano de tratamento', preco: primeira.v.preco, restantes: livres.length, venceEm: null,
        numero: primeira.numero, total: todas.length, duracaoMin: primeira.v.duracaoMin,
      })
    }
  }
  return saida
}

/**
 * PA-13/PA-14 (D15 da 31ª): o em aberto de cada pacote das sessões oferecidas
 * (`metrics_em_aberto_dos_pacotes`, contado no banco) e, na rede que só libera
 * depois de pago, a recusa — antes de a pessoa escolher a sessão, não só ao
 * salvar. Tira os campos de trabalho (`pacoteId`, `unidadeDoPacote`).
 */
async function comOEmAbertoDosPacotes(
  admin: Admin, tenantId: string, saida: (CreditoParaAgendar & { pacoteId?: string; unidadeDoPacote?: string | null })[], veOEmAberto: boolean,
): Promise<void> {
  const ids = [...new Set(saida.filter(c => c.tipo === 'PACOTE' && c.pacoteId).map(c => c.pacoteId!))]
  if (ids.length) {
    const [regrasLidas, emAberto] = await Promise.all([
      ler(admin.from('tenants').select('pacote_crediario_libera, pacote_vencido_cancela').eq('id', tenantId).maybeSingle(), 'ler as regras do pacote da rede'),
      admin.rpc('metrics_em_aberto_dos_pacotes', { p_tenant: tenantId, p_pacotes: ids }),
    ])
    if (emAberto.error) throw new Error(`Não consegui ler o em aberto dos pacotes: ${emAberto.error.message}`)
    const regras = lerRegrasDoPacote(regrasLidas)
    const porPacote = new Map(((emAberto.data ?? []) as { client_package_id: string; em_aberto: number | string; parcelas: number }[])
      .map(l => [l.client_package_id, { valor: Number(l.em_aberto), parcelas: Number(l.parcelas) }]))
    for (const c of saida) {
      const aberto = c.pacoteId ? porPacote.get(c.pacoteId) : undefined
      if (c.tipo !== 'PACOTE' || !aberto || !(aberto.valor > 0)) continue
      if (veOEmAberto) c.emAberto = { ...aberto, unidadeId: c.unidadeDoPacote ?? null, liberaAsSessoes: regras.crediarioLibera }
      c.recusa = recusaDaSessaoNaoLiberada(regras, aberto.valor)
    }
  }
  for (const c of saida) { delete c.pacoteId; delete c.unidadeDoPacote }
}
