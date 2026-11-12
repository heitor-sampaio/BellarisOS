import { notFound } from 'next/navigation'
import { nomesDasSessoesDoPlano } from '@/lib/plano-de-tratamento/nome-da-sessao-no-servidor'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, assertPermission, can, isOwnScope, podeReceber } from '@/lib/auth'
import { quemDesfazNoCaixa } from '@/lib/equipe/quem-desfaz'
import { getPagoComCreditoDoCliente } from '@/lib/metrics/fechamento-extra'
import { idadeEm, formatBRL } from '@estetica-os/utils'
import { responsavelDaFicha } from '@/lib/clients/menor'
import { indicacaoDaFicha } from '@/lib/clientes/indicacao-da-ficha'
import { unificacoesDaFicha } from '@/lib/clients/unificacoes'
import { historicoDoCancelamento } from '@/lib/pacotes/cancelamento'
import { camposDoPacoteDeFora, linhaDoHistoricoDoPacote } from '@/lib/pacotes/de-fora'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getDoCliente } from '@/lib/metrics/unidade'
import { financeiroDaFicha } from '@/lib/clientes/financeiro-da-ficha'
import { CLIENT_DOCS_BUCKET, getSignedUrls } from '@/lib/storage'
import { ehAnexoClinico, atendimentoDoAnexo } from '@/lib/clientes/anexos'
import { formatarNoFuso } from '@/lib/formatar-no-fuso'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { ClientProfile } from '@/components/branch/client-profile'
import { pedidoLgpdDaFicha } from '@/lib/lgpd/aviso-do-pedido'
import { eventosDeConfirmacaoEChegada, eventoDaAvaliacao, comAutores } from '@/lib/clients/historico-do-agendamento'
import { notasDosProcedimentos } from '@/lib/avaliacao/leitura'
import { historicoDosAgendamentos } from '@/lib/clients/autores-do-historico'
import { pacotesAVenda } from '@/lib/pacotes/leitura'
import { procedimentosAVenda, prePagosDoCliente } from '@/lib/pre-pago/leitura'
import { produtosAVenda } from '@/lib/produtos/leitura'
import { equipeDaVenda } from '@/lib/vendas/equipe-da-venda'
import { veComissaoDeTodos } from '@/lib/comissoes/quem-ve'
import { oportunidadesDoCliente } from '@/lib/crm/oportunidades-do-cliente'
import { procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import type { ProfileClient, ProfileStats, ProfileAppointment, ProfilePackage, ClientHistoryEvent } from '@/components/branch/client-profile'
import type { ClientDocumentItem } from '@/components/branch/client-documents-tab'
import { buildRecordForms, type RawMreEntry } from '@/lib/record-forms'
import { lotesDosAtendimentos } from '@/lib/prontuario/lotes-dos-atendimentos'
import { planejamentosAbriveisDasFichas } from '@/lib/injetaveis/alcance'
import { clienteNoEscopo } from '@/lib/clientes/atendida-por'
import { paraAnamneseGeral } from '@/lib/anamnese-geral'
import { fichaDePreAtendimento } from '@/lib/pre-atendimento/ficha'
import { createAdminClient as clienteDeServico } from '@/lib/supabase/admin'
import { documentosDoCliente, assinadosDoCliente } from '@/lib/documentos/leitura'
import { envioPelaConversaLigado } from '@/lib/documentos/link-pela-conversa'

const SUBTITULO_DO_CANAL: Record<string, string> = {
  CLINICA: 'Na clínica', PAPEL: 'No papel', PORTAL: 'Pelo portal', LINK: 'Por link',
}
import { fidelidadeDoPerfil } from '@/lib/fidelidade/leitura'
import { registrarAcessoAoProntuario, acessosAoProntuario } from '@/lib/prontuario/acessos'
import { nomeDosProcedimentos } from '@/lib/plano-de-tratamento/nome'
import { getEmAbertoDosPacotes } from '@/lib/metrics/pacote-em-aberto'

const UPCOMING_STATUSES = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS']

export default async function AdminClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx     = await getTenantContext()
  assertPermission(ctx, 'clients', 'VIEW')

  const admin = createAdminClient()

  // Cliente por id + tenant (sem trava de filial).
  //
  // Erro de consulta não é cliente inexistente: com o erro descartado, uma
  // recusa do PostgREST virava um 404 e a ficha sumia sem explicação.
  const { data: raw, error: clientErr } = await admin
    .from('clients')
    .select('*, branches!branch_id(id, name, slug)')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (clientErr) throw new Error('Não foi possível carregar o cliente: ' + clientErr.message)
  if (!raw) notFound()

  // Cliente pertence à REDE — pode não ter filial vinculada (branch_id nullable).
  const branchRow = raw.branches as { id: string; name: string; slug: string } | null

  const client: ProfileClient = {
    id:                raw.id,
    name:              raw.name,
    phone:             raw.phone,
    email:             raw.email ?? null,
    document:          raw.document ?? null,
    documentoTipo:     (raw.documento_tipo as ProfileClient["documentoTipo"]) ?? null,
    documentoNumero:   raw.documento_numero ?? null,
    birthDate:         raw.birth_date ?? null,
    gender:            raw.gender ?? null,
    tags:              (raw.tags as string[]) ?? [],
    notes:             raw.notes ?? null,
    isActive:          raw.is_active,
    createdAt:         raw.created_at,
    clienteDesde:      raw.cliente_desde ?? null,
    zipCode:           raw.zip_code ?? null,
    address:           raw.address ?? null,
    addressNumber:     raw.address_number ?? null,
    addressComplement: raw.address_complement ?? null,
    neighborhood:      raw.neighborhood ?? null,
    city:              raw.city ?? null,
    state:             raw.state ?? null,
    temAcesso:         !!raw.auth_id,
    // O responsável legal da menor (decisão 2 do Heitor, 2026-11-05).
    responsavel:       responsavelDaFicha(raw),
    // A indicação (decisão do Heitor, 2026-11-10): quem a indicou e quem ela indicou, com o prêmio.
    indicacao:         await indicacaoDaFicha(ctx.tenantId!, raw.id as string, raw),
  }

  const [
    appts,
    fidelidade,
    medRecord,
    pkgs,
    docsRaw,
    branchesRaw,
    activePlansRaw,
    allPlansHistRaw,
  ] = await Promise.all([
    ler(admin
      .from('appointments')
      .select('id, branch_id, scheduled_at, status, price, treatment_plan_id, created_at, completed_at, cancelled_at, confirmed_at, arrived_at, professional_id, client_confirmed_at, procedure_rating, client_rating, client_feedback, procedures(name), professional:users!professional_id(name)')
      .eq('client_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(60), 'carregar os agendamentos do cliente'),

    // Nulo com o programa desligado ou sem o módulo no cargo: a ficha não mostra pontos.
    fidelidadeDoPerfil(ctx, id),

    ler(admin
      .from('medical_records')
      .select('id, general_anamnesis, entries:medical_record_entries(appointment_id, notes, intercurrences, queixas, form_data, created_at)')
      .eq('client_id', id)
      .maybeSingle(), 'carregar o prontuário'),

    ler(admin
      .from('client_packages')
      .select('id, total_sessions, used_sessions, expires_at, purchased_at, cancelado_em, cancelamento_motivo, cancelamento, de_fora, usadas_antes, valor_referencia, service_packages(name, procedure_id, price, procedures(name, duration_min)), package_sessions(status, appointment_id)')
      .eq('client_id', id)
      .order('purchased_at', { ascending: false })
      .limit(10), 'carregar os pacotes'),

    ler(admin
      .from('client_documents')
      .select('id, name, category, file_path, file_name, file_size, mime_type, uploaded_by:users!uploaded_by(name), created_at, enviado_em, enviado_por_nome, atendimento:appointments!client_documents_appointment_id_fkey(id, scheduled_at, procedures(name))')
      .eq('client_id', id)
      .is('apagado_em', null)
      .order('created_at', { ascending: false }), 'carregar os documentos'),

    ler(admin
      .from('branches')
      .select('id, name, slug')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .order('name'), 'carregar as unidades'),

    ler(admin
      .from('treatment_plans')
      .select('id, status, treatment_plan_sessions(id, treatment_plan_session_procedures(procedure_id, price, procedures(name, duration_min)))')
      .eq('client_id', id)
      .eq('status', 'ACCEPTED')
      .order('created_at', { ascending: false })
      .limit(1), 'carregar o plano aceito'),

    ler(admin
      .from('treatment_plans')
      .select('id, status, created_at, updated_at, name, cancelado_em, cancelamento_motivo, cancelamento')
      .eq('client_id', id)
      .order('created_at', { ascending: false }), 'carregar o histórico de planos'),
  ])

  // Filial "efetiva": a vinculada ao cliente ou, na ausência, a primeira ativa
  // da rede. Serve de CONTEXTO para links e leituras — nunca para gravar por
  // filial: cliente de rede não tem filial (`clients.branch_id` é nulo desde a
  // migração de clientes de rede), e herdar a primeira em ordem alfabética
  // mandava o crédito interno para o caixa de outra unidade. Quem grava pergunta.
  const effBranch = branchRow ?? ((branchesRaw?.[0] ?? null) as { id: string; name: string; slug: string } | null)
  const branchId  = effBranch?.id ?? ''
  const slug      = effBranch?.slug ?? ''
  // Com duas ou mais unidades, quem grava por unidade PERGUNTA (D1 e A14 da 8ª
  // simulação; H5: "nada se prende a clients.branch_id"): a venda, o crédito,
  // os pontos, o voucher e a sessão nascem sem unidade escolhida. A venda saía
  // da unidade de cadastro da Patrícia (Água Verde, "Hidratante — sem
  // estoque"), e só deu entrando pelo portal do Batel.
  const unidadesAtivas = (branchesRaw ?? []) as { id: string; name: string; slug: string }[]
  const perguntaAUnidade = unidadesAtivas.length > 1
  const vendaPorUnidade = perguntaAUnidade && podeReceber(ctx)
    ? await Promise.all(unidadesAtivas.map(async u => {
        const [pacotes, procedimentos, produtos, equipe] = await Promise.all([
          pacotesAVenda(ctx.tenantId!, u.id), procedimentosAVenda(ctx.tenantId!, u.id),
          produtosAVenda(ctx.tenantId!, u.id), equipeDaVenda(ctx.tenantId!, u.id, ctx.internalUserId, veComissaoDeTodos(ctx)),
        ])
        return { id: u.id, nome: u.name, pacotes, procedimentos, produtos, equipe }
      }))
    : []

  // KPIs
  // O dinheiro do cliente vem do banco, pela regra do sistema (§13.1): LTV é
  // o que ele PAGOU desde sempre (sem estorno — o mesmo LTV do dashboard) e o
  // ticket é serviço dos concluídos ÷ concluídos. A ficha somava "preço dos
  // atendimentos + lançamentos pagos sem agendamento" no JS: contava estorno,
  // contava atendimento que nunca foi pago, e dividia por outra base.
  const doCliente = await getDoCliente(ctx.tenantId!, id)
  const age              = idadeEm(client.birthDate)

  const stats: ProfileStats = {
    totalSessions: doCliente.atendimentos,
    totalInvested: doCliente.ltv,
    mediaPorAtendimento: doCliente.mediaPorAtendimento,
    receitaServico: doCliente.receitaServico,
    atendimentosCobrados: doCliente.atendimentosCobrados,
    age,
  }

  // A32 da 7ª (sobra da A36 da 6ª): a sessão de plano com dois procedimentos
  // diz os dois ("Criolipólise + Drenagem"), e não só o do agendamento.
  const nomesDasSessoes = await nomesDasSessoesDoPlano(createAdminClient(), (appts ?? []).map(a => a.id as string))
  const allAppointments: ProfileAppointment[] = (appts ?? []).map(a => ({
    id:               a.id,
    scheduledAt:      a.scheduled_at,
    price:            parseFloat(String(a.price ?? 0)),
    status:           a.status,
    procedureName:    nomesDasSessoes.get(a.id as string) ?? (a.procedures as { name?: string } | null)?.name ?? '—',
    professionalName: (a.professional as { name?: string } | null)?.name ?? '—',
  }))

  const upcomingAppointments = allAppointments
    .filter(a => UPCOMING_STATUSES.includes(a.status))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  // O "Histórico de procedimentos" é o que ela FEZ (J-26): o cancelado (o
  // em duplicidade, inclusive) e a falta ficam na linha do tempo.
  const recentAppointments   = allAppointments
    .filter(a => a.status === 'COMPLETED')
    .slice(0, 30)

  let activePackage: ProfilePackage | null = null
  const pkgsArray = Array.isArray(pkgs) ? pkgs : pkgs ? [pkgs] : []
  const now = new Date()
  // O pacote cancelado (F2b) não está em andamento: fica só no histórico.
  const activePkg = pkgsArray.find(p =>
    !(p as { cancelado_em?: string | null }).cancelado_em &&
    p.used_sessions < p.total_sessions &&
    (!p.expires_at || new Date(p.expires_at) > now)
  )
  if (activePkg) {
    const sp   = activePkg.service_packages as { name?: string; procedure_id?: string; price?: number; procedures?: { name?: string; duration_min?: number } | null } | null
    const proc = sp?.procedures ?? null
    activePackage = {
      id:            activePkg.id,
      name:          sp?.name ?? 'Pacote',
      totalSessions: activePkg.total_sessions,
      usedSessions:  activePkg.used_sessions,
      // As restantes já agendadas (A27): o cartão diz "2 sessões restantes · 1 agendada".
      scheduledSessions: ((activePkg as { package_sessions?: { status: string; appointment_id: string | null }[] }).package_sessions ?? [])
        .filter(s => s.status === 'AVAILABLE' && !!s.appointment_id).length,
      procedureId:   sp?.procedure_id ?? '',
      procedureName: proc?.name ?? sp?.name ?? '—',
      price:         Number(sp?.price ?? 0) / (activePkg.total_sessions || 1),
      durationMin:   proc?.duration_min ?? 60,
      // O pacote trazido de fora (F35): "Pacote de antes" e as usadas antes do sistema (A57).
      ...camposDoPacoteDeFora(activePkg as { de_fora?: boolean; usadas_antes?: number; valor_referencia?: number | null }),
    }
    // A41 da 11ª: o crediário do pacote ainda em aberto (só a quem recebe — o dinheiro é do caixa, A39 da 7ª).
    if (podeReceber(ctx)) activePackage.emAberto = (await getEmAbertoDosPacotes(ctx.tenantId!, [activePkg.id as string]))[activePkg.id as string] ?? null
  }

  if (!activePackage && activePlansRaw && activePlansRaw.length > 0) {
    type RawSessProc = { procedure_id: string; price: string; procedures: { name: string; duration_min: number } | null }
    type RawSess     = { id: string; treatment_plan_session_procedures: RawSessProc[] }
    const plan       = activePlansRaw[0] as unknown as { id: string; status: string; treatment_plan_sessions: RawSess[] }
    const sessions   = plan.treatment_plan_sessions ?? []
    const totalSess  = sessions.length
    const completedSess = (appts ?? []).filter(
      (a: { status: string; treatment_plan_id: string | null }) => a.status === 'COMPLETED' && a.treatment_plan_id === plan.id
    ).length
    const firstProc  = sessions[0]?.treatment_plan_session_procedures?.[0] ?? null
    const allProcNames = [...new Set(sessions.flatMap(s =>
      s.treatment_plan_session_procedures.map(p => p.procedures?.name ?? '—')
    ))]
    // Pelos procedimentos (A36): era "Botox + 1 mais".
    const planName = nomeDosProcedimentos(allProcNames) ?? 'Tratamento'
    activePackage = {
      id:            plan.id,
      name:          planName,
      totalSessions: totalSess,
      usedSessions:  completedSess,
      scheduledSessions: (appts ?? []).filter(
        (a: { status: string; treatment_plan_id: string | null }) => ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(a.status) && a.treatment_plan_id === plan.id
      ).length,
      procedureId:   firstProc?.procedure_id ?? '',
      procedureName: planName,
      price:         Number(firstProc?.price ?? 0),
      durationMin:   firstProc?.procedures?.duration_min ?? 60,
      planId:        plan.id,
      planStatus:    plan.status,
    }
  }

  const mreEntries  = (medRecord?.entries as RawMreEntry[] | null) ?? []

  const apptNameById = new Map(allAppointments.map(a => [a.id, a.procedureName]))
  // Prontuário é dado sensível de saúde: sem o módulo, nem carrega. E com
  // alcance "só os próprios pacientes", só de quem este profissional atendeu.
  const canViewRecords = can(ctx, 'medical_records', 'VIEW') && (
    !isOwnScope(ctx, 'medical_records') ||
    (appts ?? []).some((a: { professional_id?: string | null }) => a.professional_id === ctx.internalUserId)
  )
  // Quem viu o prontuário fica registrado (lib/prontuario/acessos.ts) — só
  // quando ele vai à tela; o admin da rede vê o registro na própria ficha.
  if (canViewRecords) await registrarAcessoAoProntuario(ctx, id, 'ficha')
  const acessosDoProntuario = await acessosAoProntuario(ctx, id)
  const recordForms  = canViewRecords ? buildRecordForms(mreEntries, apptNameById, new Map(allAppointments.map(a => [a.id, a.scheduledAt])),
    new Set(allAppointments.filter(a => a.status === 'COMPLETED').map(a => a.id))) : []
  // A33 da 11ª: o lote que cada atendimento usou (a baixa), no prontuário — e o
  // caminho ao "Aplicado em" do lote, a quem abre o Estoque e as Clientes.
  const lotesDosAtendimentosDaFicha = canViewRecords ? await lotesDosAtendimentos(admin, ctx.tenantId!, recordForms.map(r => r.appointmentId)) : {}
  // O planejador de injetáveis retratado na ficha leva ao planejamento — se
  // ele existe e quem vê pode abri-lo (2026-10-29).
  const planejamentosQueAbrem = canViewRecords
    ? await planejamentosAbriveisDasFichas(admin, ctx, id, recordForms.map(r => r.ficha))
    : []
  const generalAnamnesis = canViewRecords ? paraAnamneseGeral(medRecord?.general_anamnesis ?? null, await fichaDePreAtendimento(clienteDeServico(), ctx.tenantId!)) : null

  // O financeiro da cliente — lançamentos, totais, crédito e os atendimentos a
  // receber — é UMA leitura (lib/clientes/financeiro-da-ficha.ts), com o "só os
  // próprios" do financeiro (D6, 2026-10-27).
  const financeiro = await financeiroDaFicha(ctx, id)
  const { veFinanceiro, transactions, internalCredits, aReceber } = financeiro

  type RawDoc = { id: string; name: string; category: string; file_path: string; file_name: string; file_size: number | null; mime_type: string | null; uploaded_by: { name: string } | null; created_at: string; enviado_em: string | null; enviado_por_nome: string | null; atendimento: { id: string; scheduled_at: string; procedures: { name: string } | null } | null }
  // Anexo clínico (exame, laudo…) é prontuário: sem o módulo, nem sai daqui.
  const rawDocs = ((docsRaw as RawDoc[] | null) ?? []).filter(d => canViewRecords || !ehAnexoClinico(d.category))
  // A35 da 11ª: quantos anexos clínicos ficaram de fora (o recorte), para a aba
  // não dizer "Nenhum documento" quando há — só a contagem, nada do conteúdo.
  const anexosClinicosFora = canViewRecords ? 0 : ((docsRaw as RawDoc[] | null) ?? []).filter(d => ehAnexoClinico(d.category)).length
  const docUrlMap = await getSignedUrls(CLIENT_DOCS_BUCKET, rawDocs.map(d => d.file_path))
  const documents: ClientDocumentItem[] = rawDocs.map(d => ({
    id: d.id, name: d.name, category: d.category, fileUrl: docUrlMap[d.file_path] ?? '', fileName: d.file_name,
    fileSize: d.file_size, mimeType: d.mime_type, uploadedBy: d.uploaded_by?.name ?? null, createdAt: d.created_at,
    atendimento: atendimentoDoAnexo(d.atendimento),
    enviadoEm:   d.enviado_em,
    enviadoPor:  d.enviado_por_nome,
  }))

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH: 'Dinheiro', PIX: 'Pix', DEBIT_CARD: 'Débito',
    CREDIT_CARD: 'Crédito', INTERNAL_CREDIT: 'Crédito interno',
  }

  const appAccountCreatedAt = raw.app_account_created_at as string | null

  type RawHistoryPlan  = { id: string; status: string; created_at: string; updated_at: string | null; name: string | null; cancelado_em: string | null; cancelamento_motivo: string | null; cancelamento: unknown }

  let evIdx = 0
  const uid = (prefix: string) => `${prefix}-${evIdx++}`
  const history: ClientHistoryEvent[] = []

  history.push({ id: uid('cc'), date: raw.created_at, type: 'CLIENT_CREATED', title: 'Cliente cadastrado', subtitle: null, amount: null, link: null })

  if (appAccountCreatedAt) {
    history.push({ id: uid('aa'), date: appAccountCreatedAt, type: 'APP_ACCOUNT', title: 'Conta criada no app', subtitle: null, amount: null, link: null })
  }

  // F17-3: as notas que a cliente deu a cada procedimento, dos atendimentos que ela confirmou.
  const notasDasAvaliacoes = await notasDosProcedimentos(admin,
    ((appts ?? []) as { id: string; client_confirmed_at?: string | null }[]).filter(a => a.client_confirmed_at).map(a => a.id))
  // F64: a hora do agendamento no relógio da unidade DELE (a ficha é da clínica, H5).
  const fusoDoAgendamento = new Map<string, string>()
  for (const b of new Set((appts ?? []).map(a => (a as { branch_id?: string | null }).branch_id ?? null))) {
    fusoDoAgendamento.set(b ?? '', await fusoDaUnidade(ctx.tenantId, b))
  }
  for (const a of (appts ?? [])) {
    const proc   = (a.procedures as { name?: string } | null)?.name ?? '—'
    const prof   = (a.professional as { name?: string } | null)?.name ?? '—'
    const label  = proc
    history.push(...eventosDeConfirmacaoEChegada(
      { id: a.id, procedureName: proc, confirmed_at: a.confirmed_at ?? null, arrived_at: a.arrived_at ?? null }, `/admin/agenda/${a.id}`))
    // A avaliação que a cliente deixou no app, com o comentário (J-26).
    const avaliacao = eventoDaAvaliacao({ id: a.id, procedureName: proc, client_confirmed_at: a.client_confirmed_at,
      procedure_rating: a.procedure_rating, client_rating: a.client_rating, client_feedback: a.client_feedback,
      notas_dos_procedimentos: notasDasAvaliacoes.get(a.id) ?? [] }, `/admin/agenda/${a.id}`)
    if (avaliacao) history.push(avaliacao)

    if (a.status === 'COMPLETED' && a.completed_at) {
      history.push({ id: uid('ac'), date: a.completed_at, type: 'APPOINTMENT_COMPLETED', title: `Atendimento: ${label}`, subtitle: `com ${prof}`, amount: parseFloat(String(a.price ?? 0)), link: `/admin/agenda/${a.id}` })
    } else if (a.status === 'CANCELLED' && a.cancelled_at) {
      history.push({ id: uid('ax'), date: a.cancelled_at, type: 'APPOINTMENT_CANCELLED', title: `Cancelado: ${label}`, subtitle: null, amount: null, link: `/admin/agenda/${a.id}` })
    } else if (a.status === 'NO_SHOW') {
      history.push({ id: uid('an'), date: a.scheduled_at, type: 'APPOINTMENT_NO_SHOW', title: `Não compareceu: ${label}`, subtitle: null, amount: null, link: `/admin/agenda/${a.id}` })
    } else {
      history.push({ id: uid('as'), date: a.created_at ?? a.scheduled_at, type: 'APPOINTMENT_SCHEDULED', title: `Agendamento: ${label}`, subtitle: `${formatarNoFuso(a.scheduled_at, "dd/MM/yyyy 'às' HH:mm", fusoDoAgendamento.get((a as { branch_id?: string | null }).branch_id ?? ''))} · ${prof}`, amount: null, link: `/admin/agenda/${a.id}` })
    }
  }

  for (const tx of transactions) {
    if (tx.isPaid) {
      history.push({ id: uid('pay'), date: tx.paidAt ?? tx.createdAt, type: 'PAYMENT', title: tx.procedureName ? `Pagamento: ${tx.procedureName}` : (tx.description || 'Pagamento recebido'), subtitle: tx.paymentMethod ? (PAYMENT_METHOD_LABELS[tx.paymentMethod] ?? tx.paymentMethod) : null, amount: tx.amount, link: null })
    }
  }

  for (const plan of ((allPlansHistRaw as RawHistoryPlan[] | null) ?? [])) {
    if (plan.status === 'DRAFT' || plan.status === 'PROPOSED') {
      history.push({ id: uid('pp'), date: plan.created_at, type: 'PLAN_PROPOSED', title: 'Plano de tratamento proposto', subtitle: null, amount: null, link: null })
    } else if (plan.status === 'ACCEPTED') {
      history.push({ id: uid('pa'), date: plan.updated_at ?? plan.created_at, type: 'PLAN_ACCEPTED', title: 'Plano de tratamento aceito', subtitle: 'Checkout realizado', amount: null, link: null })
    } else if (plan.cancelado_em) {
      // O plano fechado cancelado (D4 da 9ª): a conta, como o do pacote.
      const cancelado = historicoDoCancelamento(plan, plan.name?.trim() || 'Plano de tratamento', formatBRL, 'Plano')
      if (cancelado) history.push({ id: uid('pc'), type: 'PLAN_CANCELLED', link: null, ...cancelado })
    } else if (plan.status === 'CANCELLED' || plan.status === 'REJECTED') {
      history.push({ id: uid('pc'), date: plan.updated_at ?? plan.created_at, type: 'PLAN_CANCELLED', title: 'Plano de tratamento cancelado', subtitle: null, amount: null, link: null })
    }
  }

  for (const pkg of pkgsArray) {
    const sp      = pkg.service_packages as { name?: string; price?: number } | null
    const pkgDate = (pkg as { purchased_at?: string | null }).purchased_at ?? undefined
    if (pkgDate) {
      history.push({ id: uid('pkg'), date: pkgDate, type: 'PACKAGE_PURCHASED', link: null, ...linhaDoHistoricoDoPacote(pkg as { de_fora?: boolean; total_sessions: number; usadas_antes?: number }, sp?.name ?? 'Pacote', Number(sp?.price ?? 0)) })
    }
    const cancelado = historicoDoCancelamento(pkg as { cancelado_em?: string | null }, sp?.name ?? 'Pacote', formatBRL)
    if (cancelado) history.push({ id: uid('pkgc'), type: 'PACKAGE_CANCELLED', link: null, ...cancelado })
  }

  // Termos e contratos assinados (os novos e o legado do checkout antigo).
  // A LISTA dos documentos segue o prontuário "só os meus" (decisão do
  // Heitor, 2026-10-29); a linha do tempo, NÃO (doc-03, 2026-11-02: "o
  // histórico não é dado clínico, é o histórico de ações feitas no cliente
  // dentro do sistema"): o "Assinado: <título>" aparece a quem vê a ficha. A
  // linha leva só o título do modelo e o canal — nada do conteúdo.
  const veDocumentos = await clienteNoEscopo(admin, ctx, 'medical_records', id)
  for (const doc of await assinadosDoCliente(ctx.tenantId, id)) {
    history.push({ id: uid('ct'), date: doc.assinadoEm, type: 'CONSENT_SIGNED', title: `Assinado: ${doc.titulo}`, subtitle: doc.canal ? SUBTITULO_DO_CANAL[doc.canal] ?? null : null, amount: null, link: null })
  }

  // 8. O "Unificar com a ficha" do cadastro (A23 da 7ª simulação), da corrente de eventos.
  for (const u of await unificacoesDaFicha(admin, ctx.tenantId!, id)) {
    history.push({ id: uid('un'), date: u.date, type: 'CLIENT_UNIFIED', title: 'Ficha unificada pelo cadastro', subtitle: u.subtitle, amount: null, link: null, autor: u.autor })
  }

  // Quem fez cada ação (J-27): o nome que appointment_history guardou.
  const clientHistory = comAutores(history, await historicoDosAgendamentos(admin, (appts ?? []).map(a => a.id as string)))
    .sort((a, b) => b.date.localeCompare(a.date))

  // Procedimentos e insumos do editor de plano — a aba Planejamento monta o
  // plano do cliente sem depender de nenhum atendimento.
  // Com várias unidades, o plano não tem unidade aqui: o preço da rede (D2 da 9ª).
  const planoProcs = await procedimentosParaPlano(ctx.tenantId!, perguntaAUnidade ? null : branchId || null)

  // Negociacoes desta pessoa: ser cliente nao encerra o funil -- reativacao e
  // abrir oportunidade nova para quem ja comprou.
  const oportunidades = await oportunidadesDoCliente(ctx.tenantId!, client.id)

  return (
    <>
      <RealtimeRefresher tables={['appointments', 'client_packages']} />
      <ClientProfile
        client={client}
        pedidoLgpd={await pedidoLgpdDaFicha(ctx, id)}
        branchId={branchId}
        stats={stats}
        upcomingAppointments={upcomingAppointments}
        recentAppointments={recentAppointments}
        allAppointments={allAppointments}
        recordForms={recordForms}
        lotesDosAtendimentos={lotesDosAtendimentosDaFicha}
        podeAbrirLote={can(ctx, 'stock', 'VIEW') && can(ctx, 'clients', 'VIEW')}
        anexosClinicosFora={anexosClinicosFora}
        podeVerProntuario={canViewRecords}
        planejamentosQueAbrem={planejamentosQueAbrem}
        acessosAoProntuario={acessosDoProntuario}
        generalAnamnesis={generalAnamnesis}
        fidelidade={fidelidade}
        activePackage={activePackage}
        transactions={transactions}
        veFinanceiro={veFinanceiro}
        totaisFinanceiros={financeiro.totais}
        financeiroSoOsProprios={financeiro.soOsProprios}
        internalCredits={internalCredits}
        documents={documents}
        termos={can(ctx, 'documents', 'VIEW')
          ? { itens: veDocumentos ? await documentosDoCliente(ctx.tenantId!, id) : [], recortado: !veDocumentos, podeColher: can(ctx, 'documents', 'MANAGE'),
            pelaConversa: await envioPelaConversaLigado(ctx.tenantId!) }
          : null}
        canGrantCredit={ctx.permissions.financial === 'MANAGE'}
        branches={(branchesRaw ?? []) as { id: string; name: string }[]}
        currentBranchId={perguntaAUnidade ? '' : branchId}
        slug={slug}
        canManageProcedures={can(ctx, 'medical_records', 'MANAGE')}
        // Anexo clínico com o alcance da ficha (o "só os meus" do prontuário).
        podeAnexarClinico={can(ctx, 'medical_records', 'MANAGE') && canViewRecords}
        podeAnexarComum={can(ctx, 'clients', 'MANAGE')}
        planProcedures={planoProcs.procedures}
        planProducts={planoProcs.products}
        podeReceber={podeReceber(ctx)}
        aReceber={aReceber}
        podeReceberAtendimento={ctx.permissions.cashier === 'MANAGE'}
        pacotesAVenda={podeReceber(ctx) && !perguntaAUnidade ? await pacotesAVenda(ctx.tenantId!, branchId || null) : []}
        procedimentosAVenda={podeReceber(ctx) && !perguntaAUnidade ? await procedimentosAVenda(ctx.tenantId!, branchId || null) : []}
        produtosAVenda={podeReceber(ctx) && !perguntaAUnidade ? await produtosAVenda(ctx.tenantId!, branchId || null) : []}
        equipeDaVenda={podeReceber(ctx) && !perguntaAUnidade ? await equipeDaVenda(ctx.tenantId!, branchId || null, ctx.internalUserId, veComissaoDeTodos(ctx)) : []}
        perguntaAUnidade={perguntaAUnidade}
        vendaPorUnidade={vendaPorUnidade}
        prePagos={await prePagosDoCliente(ctx.tenantId!, id)}
        podeAgendar={can(ctx, 'agenda', 'MANAGE')}
        podeEditarCadastro={can(ctx, 'clients', 'MANAGE')}
        podeExportarProntuario={can(ctx, 'medical_records', 'MANAGE')}
        podeVerPlanos={can(ctx, 'agenda', 'VIEW')}
      podeCancelarPacote={can(ctx, 'financial', 'MANAGE')}
        podeRemarcar={can(ctx, 'financial', 'MANAGE') && !isOwnScope(ctx, 'financial')}
        // A32 e A35 da 12ª: estornar (o Financeiro em Gerenciar) e receber a parcela (Recebimentos) na ficha.
        podeEstornar={can(ctx, 'financial', 'MANAGE') && !isOwnScope(ctx, 'financial')}
        podeReceberParcela={ctx.permissions.cashier === 'MANAGE'}
        quemDesfaz={podeReceber(ctx) && !can(ctx, 'financial', 'MANAGE') ? await quemDesfazNoCaixa(ctx.tenantId!, ctx.branchId ?? null) : null}
        pagoComCredito={await getPagoComCreditoDoCliente(ctx.tenantId!, id)}
        isNetworkWide={ctx.branchId === null}
        clienteSemFilial={!branchRow}
        clientHistory={clientHistory}
        opportunities={oportunidades}
      />
    </>
  )
}
