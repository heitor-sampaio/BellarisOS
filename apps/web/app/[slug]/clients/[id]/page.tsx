import { notFound } from 'next/navigation'
import { nomesDasSessoesDoPlano } from '@/lib/plano-de-tratamento/nome-da-sessao-no-servidor'
import { idOu404 } from '@/lib/id-da-rota'
import { getTenantContext, can, podeReceber, podeVerClinico, temRecurso } from '@/lib/auth'
import { montaPlano } from '@/lib/plano-de-tratamento/quem-monta'
import { quemDesfazNoCaixa, quemCompletaOCadastro } from '@/lib/equipe/quem-desfaz'
import { veOsDocumentos, dispensaDocumentos } from '@/lib/documentos/acesso'
import { getPagoComCreditoDoCliente } from '@/lib/metrics/fechamento-extra'
import { idadeEm, formatBRL } from '@estetica-os/utils'
import { responsavelDaFicha } from '@/lib/clients/menor'
import { indicacaoDaFicha } from '@/lib/clientes/indicacao-da-ficha'
import { unificacoesDaFicha } from '@/lib/clients/unificacoes'
import { historicoDoCancelamento } from '@/lib/pacotes/cancelamento'
import { linhaDoHistoricoDoPacote } from '@/lib/pacotes/de-fora'
import { pacotesEmAndamento, pacoteDaFicha, type PacoteLido } from '@/lib/clientes/pacotes-da-ficha'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLIENT_DOCS_BUCKET, getSignedUrls } from '@/lib/storage'
import { ehAnexoClinico, atendimentoDoAnexo } from '@/lib/clientes/anexos'
import { getCachedBranchBySlug, getCachedClientProfileData } from '@/lib/cached-queries'
import { formatarNoFuso } from '@/lib/formatar-no-fuso'
import { fusoDaUnidade, fusosDasUnidades } from '@/lib/unidades/fuso-da-unidade'
import { regrasDoPacoteDaRede, pacoteVencidoDaFicha } from '@/lib/pacotes/regras-da-rede'
import { sessoesPresas } from '@/lib/pacotes/regras'
import { ClientProfile } from '@/components/branch/client-profile'
import { pedidoLgpdDaFicha } from '@/lib/lgpd/aviso-do-pedido'
import { eventosDeConfirmacaoEChegada, eventoDaAvaliacao, eventosDeRemarcacao, comAutores, linkDoAtendimento } from '@/lib/clients/historico-do-agendamento'
import { notasDosProcedimentos } from '@/lib/avaliacao/leitura'
import { historicoDosAgendamentos } from '@/lib/clients/autores-do-historico'
import { BUSINESS_TZ } from '@/lib/datetime'
import { marcarOsDeAntes } from '@/lib/clientes/proximos-da-ficha'
import { prePagosDoCliente } from '@/lib/pre-pago/leitura'
import { oportunidadesDoCliente } from '@/lib/crm/oportunidades-do-cliente'
import { procedimentosParaPlano } from '@/lib/checkout/procedimentos-do-plano'
import { getDoCliente } from '@/lib/metrics/unidade'
import { financeiroDaFicha } from '@/lib/clientes/financeiro-da-ficha'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import type { ProfileClient, ProfileStats, ProfileAppointment, ProfilePackage, ClientHistoryEvent } from '@/components/branch/client-profile'
import type { ClientDocumentItem } from '@/components/branch/client-documents-tab'
import { buildRecordForms, type RawMreEntry } from '@/lib/record-forms'
import { lotesDosAtendimentos } from '@/lib/prontuario/lotes-dos-atendimentos'
import { planejamentosAbriveisDasFichas } from '@/lib/injetaveis/alcance'
import { alergiasDaAnamnese, paraAnamneseGeral } from '@/lib/anamnese-geral'
import { fichaDePreAtendimento } from '@/lib/pre-atendimento/ficha'
import { createAdminClient as clienteDeServico } from '@/lib/supabase/admin'
import { documentosDoCliente, assinadosDoCliente } from '@/lib/documentos/leitura'
import { envioPelaConversaLigado } from '@/lib/documentos/link-pela-conversa'

const SUBTITULO_DO_CANAL: Record<string, string> = {
  CLINICA: 'Na tela', PAPEL: 'No papel', PORTAL: 'Pelo portal', LINK: 'Por link',
}
import { ler } from '@/lib/db'
import { fidelidadeDoPerfil } from '@/lib/fidelidade/leitura'
import { registrarAcessoAoProntuario, acessosAoProntuario } from '@/lib/prontuario/acessos'
import { anotacoesEVersoes } from '@/lib/prontuario/anotacoes-e-versoes'
import { nomeDosProcedimentos } from '@/lib/plano-de-tratamento/nome'
import { getEmAbertoDosPacotes } from '@/lib/metrics/pacote-em-aberto'
import { abaDaFicha } from '@/lib/clientes/aba-da-ficha'
import { assertAbreAFicha, fichaSoDoProntuario, soOProntuarioDaFicha } from '@/lib/clientes/ficha-so-do-prontuario'
import { lerAcessoPendente } from '@/lib/clients/acesso-pendente'
import type { ClientProfileProps } from '@/components/branch/client-profile'
import { podeEstornar, podeDarBaixa } from '@/lib/financeiro/so-os-meus'

const UPCOMING_STATUSES = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS']

export default async function ClientProfilePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams: Promise<{ aba?: string | string[] }>
}) {
  const { slug, id } = await params
  // O id vai a uma coluna uuid: o que não é uuid é 404, não 22P02 (D15).
  idOu404(id)
  const ctx = await getTenantContext()
  // A ficha abre com o Clientes em Ver ou o Prontuário em Ver; sem o Clientes,
  // é só a aba Prontuário (o clínico é do Prontuário — CLAUDE.md §11, o Heitor,
  // 2026-11-23: "cada passo do atendimento, um módulo").
  assertAbreAFicha(ctx)
  const soProntuario = fichaSoDoProntuario(ctx)
  // C77 (F65): o servidor monta o que a aba ABERTA mostra — a Visão geral
  // (o topo da ficha) sempre; a linha do tempo, os links assinados dos
  // documentos, as negociações e o que é só do prontuário, na aba deles. Era
  // tudo a cada abertura, e o anexar esperava a ficha inteira se refazer.
  const aba = soProntuario ? 'fichas' : abaDaFicha((await searchParams).aba)

  const admin = createAdminClient()

  const branch = await getCachedBranchBySlug(slug, ctx.tenantId!)
  if (!branch) notFound()

  // Cliente pertence à REDE: abre qualquer cliente do tenant a partir de qualquer
  // portal de unidade (a unidade é apenas uma TAG, não um lock de acesso).
  // Id de outra rede ou inexistente é 404: o .single() lançava PGRST116, e a
  // tela caía em "Algo deu errado" com HTTP 200 (CLAUDE.md §14; como /admin).
  const raw = await ler(admin
    .from('clients')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle(), 'buscar o cliente')
  if (!raw) notFound()

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
    // A4 da 31ª (princípios 3 e 7): o acesso que ainda espera a pessoa (a senha pelo e-mail, ou não entrou).
    acessoPendente:    soProntuario ? null : await lerAcessoPendente(admin, { authId: raw.auth_id ?? null, primeiroAcessoEm: raw.app_account_created_at ?? null }),
    // O responsável legal da menor (decisão 2 do Heitor, 2026-11-05).
    responsavel:       responsavelDaFicha(raw),
    // A indicação (decisão do Heitor, 2026-11-10): quem a indicou e quem ela indicou, com o prêmio.
    indicacao:         await indicacaoDaFicha(ctx.tenantId!, raw.id as string, raw),
  }

  // Parallel data fetches (cacheadas — TTL 60s, tags clients/appointments do tenant)
  const {
    appts,
    medRecord,
    pkgs,
    docsRaw,
    branchesRaw,
    activePlansRaw,
    allPlansHistRaw,
  } = await getCachedClientProfileData(id, branch.id, ctx.tenantId!)

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

  // Map appointments — separar futuros de passados

  // A32 da 7ª (sobra da A36 da 6ª): a sessão de plano com dois procedimentos
  // diz os dois ("Criolipólise + Drenagem"), e não só o do agendamento.
  const nomesDasSessoes = await nomesDasSessoesDoPlano(createAdminClient(), (appts ?? []).map(a => a.id as string))
  // D3 da 30ª (FU-02): a hora de cada agendamento no relógio da unidade dele.
  const fusos = await fusosDasUnidades(ctx.tenantId)
  const allAppointments: ProfileAppointment[] = (appts ?? []).map(a => ({
    id:               a.id,
    scheduledAt:      a.scheduled_at,
    price:            parseFloat(String(a.price ?? 0)),
    status:           a.status,
    procedureName:    nomesDasSessoes.get(a.id as string) ?? (a.procedures as { name?: string } | null)?.name ?? '—',
    professionalName: (a.professional as { name?: string } | null)?.name ?? '—',
    // A15 da 25ª: a unidade do agendamento (a ficha a diz na rede de duas ou mais).
    branchId:         (a.branch_id as string | null) ?? null,
    fuso:             fusos[a.branch_id as string] ?? null,
  }))

  // A16 da 31ª (AG-55): o em aberto de um dia anterior sai dos próximos (marcado; a ficha o mostra à parte).
  const upcomingAppointments = marcarOsDeAntes(allAppointments.filter(a => UPCOMING_STATUSES.includes(a.status)), new Date(), BUSINESS_TZ)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))  // próximo primeiro
  // O "Histórico de procedimentos" é o que ela FEZ (J-26): o cancelado (o
  // em duplicidade, inclusive) e a falta ficam na linha do tempo.
  const recentAppointments   = allAppointments.filter(a => a.status === 'COMPLETED')
    .slice(0, 30)

  // Active package — first non-exhausted, non-expired
  let activePackage: ProfilePackage | null = null
  const pkgsArray = Array.isArray(pkgs) ? pkgs : pkgs ? [pkgs] : []
  const now = new Date()
  // O pacote cancelado (F2b) não está em andamento: fica só no histórico.
  // Itens 8 e 9 da auditoria: as regras do pacote da rede (o aviso do em aberto e o cancelar do vencido).
  const regrasDoPacote = await regrasDoPacoteDaRede(ctx.tenantId!)
  const pacoteVencido = can(ctx, 'financial', 'MANAGE')
    ? await pacoteVencidoDaFicha(ctx.tenantId!, pkgsArray as unknown as Parameters<typeof pacoteVencidoDaFicha>[1], regrasDoPacote)
    : null
  // D17 da 28ª: TODOS os pacotes em andamento (dois iguais, os dois) — cada um, um cartão na ficha.
  const pacotesDaFicha: ProfilePackage[] = pacotesEmAndamento(pkgsArray as unknown as PacoteLido[], now).map(pacoteDaFicha)
  // A41 da 11ª: o crediário do pacote ainda em aberto (só a quem recebe — o dinheiro é do caixa, A39 da 7ª).
  // A5 da 37ª: na rede que só libera depois de pago, a sessão presa não oferece "Agendar" — a quem vê a ficha.
  if ((podeReceber(ctx) || !regrasDoPacote.crediarioLibera) && pacotesDaFicha.length > 0) {
    const emAbertoDos = await getEmAbertoDosPacotes(ctx.tenantId!, pacotesDaFicha.map(p => p.id))
    for (const pacote of pacotesDaFicha) {
      const emAberto = emAbertoDos[pacote.id] ?? null
      pacote.sessoesPresas = sessoesPresas(regrasDoPacote, emAberto?.valor ?? 0)
      if (!podeReceber(ctx)) continue
      const unidade = (pkgsArray.find(p => p.id === pacote.id) as { branch_id?: string | null } | undefined)?.branch_id ?? null
      // CX1: o aviso leva ao PDV da unidade do pacote, onde as parcelas dele estão.
      pacote.emAberto = emAberto ? { ...emAberto, unidadeId: unidade, liberaAsSessoes: regrasDoPacote.crediarioLibera } : null
    }
  }
  activePackage = pacotesDaFicha[0] ?? null
  const outrosPacotes = pacotesDaFicha.slice(1)

  // Fallback: plano de tratamento avulso ACCEPTED (sem client_package) — modelo sessão-primeiro
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

  const mreEntries = (medRecord?.entries as RawMreEntry[] | null) ?? []

  // Fichas preenchidas (anamnese + atendimento) por atendimento, read-only
  const apptNameById = new Map(allAppointments.map(a => [a.id, a.procedureName]))
  // Prontuário é dado sensível de saúde: sem o módulo, nem carrega.
  const canViewRecords = podeVerClinico(ctx)
  // Quem viu o prontuário fica registrado (lib/prontuario/acessos.ts) — só
  // quando ele vai à tela; o admin da rede vê o registro na própria ficha.
  // A30 da 15ª (minimização da LGPD, sem mudar quem vê): o prontuário só vai à
  // tela, e só se registra, na aba Prontuário (`?aba=fichas`).
  const noProntuario = canViewRecords && aba === 'fichas'
  const recordForms = noProntuario ? buildRecordForms(mreEntries, apptNameById, new Map(allAppointments.map(a => [a.id, a.scheduledAt])),
    new Set(allAppointments.filter(a => a.status === 'COMPLETED').map(a => a.id))) : []
  // A33 da 11ª: o lote que cada atendimento usou (a baixa), no prontuário — e o
  // caminho ao "Aplicado em" do lote, a quem abre o Estoque e as Clientes.
  const lotesDosAtendimentosDaFicha = canViewRecords && aba === 'fichas' ? await lotesDosAtendimentos(admin, ctx.tenantId!, recordForms.map(r => r.appointmentId)) : {}
  // O planejador de injetáveis retratado na ficha leva ao planejamento — se
  // ele existe e quem vê pode abri-lo (2026-10-29).
  const planejamentosQueAbrem = canViewRecords && aba === 'fichas'
    ? await planejamentosAbriveisDasFichas(admin, ctx, id, recordForms.map(r => r.ficha))
    : []
  const fichaDeSaudeDaRede = canViewRecords ? await fichaDePreAtendimento(clienteDeServico(), ctx.tenantId!) : null
  const anamneseLida = fichaDeSaudeDaRede ? paraAnamneseGeral(medRecord?.general_anamnesis ?? null, fichaDeSaudeDaRede) : null
  const generalAnamnesis = noProntuario ? anamneseLida : null
  // A exceção: o alerta de alergia, em toda aba a quem vê o prontuário — só o
  // TEXTO dela viaja, e mostrá-lo registra o acesso.
  const alergias = canViewRecords ? alergiasDaAnamnese(anamneseLida) : null
  if (noProntuario || alergias) await registrarAcessoAoProntuario(ctx, id, 'ficha')
  const acessosDoProntuario = aba === 'fichas' ? await acessosAoProntuario(ctx, id) : null

  // O financeiro da cliente — lançamentos, totais, crédito e os atendimentos a
  // receber — é UMA leitura (lib/clientes/financeiro-da-ficha.ts).
  const financeiro = await financeiroDaFicha(ctx, id)
  const { veFinanceiro, transactions, internalCredits, aReceber, comandaParaReceber, planosNaoRecebidos } = financeiro

  // Documents — bucket privado: assinamos os paths (signed URLs, 1h) para download
  type RawDoc = { id: string; name: string; category: string; file_path: string; file_name: string; file_size: number | null; mime_type: string | null; uploaded_by: { name: string } | null; created_at: string; enviado_em: string | null; enviado_por_nome: string | null; momento: string | null; atendimento: { id: string; scheduled_at: string; procedures: { name: string } | null } | null }
  // Anexo clínico (exame, laudo…) é prontuário: sem o módulo, nem sai daqui.
  const rawDocs = ((docsRaw as RawDoc[] | null) ?? []).filter(d => canViewRecords || !ehAnexoClinico(d.category))
  // A35 da 11ª: quantos anexos clínicos ficaram de fora (o recorte), para a aba
  // não dizer "Nenhum documento" quando há — só a contagem, nada do conteúdo.
  const anexosClinicosFora = canViewRecords ? 0 : ((docsRaw as RawDoc[] | null) ?? []).filter(d => ehAnexoClinico(d.category)).length
  // PR1b (a revisão de 2026-11-13): o anexo CLÍNICO mora na aba Prontuário, e
  // a aba Documentos fica com o comum (RG, comprovante, "outro", contrato).
  // O link assinado só na aba que o mostra.
  const docsComuns = rawDocs.filter(d => !ehAnexoClinico(d.category))
  // Só na aba que os mostra: em outra aba, o anexo clínico nem viaja à tela.
  const docsClinicos = canViewRecords && aba === 'fichas' ? rawDocs.filter(d => ehAnexoClinico(d.category)) : []
  const docUrlMap: Record<string, string> = aba === 'documentos' ? await getSignedUrls(CLIENT_DOCS_BUCKET, docsComuns.map(d => d.file_path))
    : aba === 'fichas' ? await getSignedUrls(CLIENT_DOCS_BUCKET, docsClinicos.map(d => d.file_path)) : {}
  const paraOItem = (d: RawDoc): ClientDocumentItem => ({
    id:          d.id,
    name:        d.name,
    category:    d.category,
    fileUrl:     docUrlMap[d.file_path] ?? '',
    fileName:    d.file_name,
    fileSize:    d.file_size,
    mimeType:    d.mime_type,
    uploadedBy:  d.uploaded_by?.name ?? null,
    createdAt:   d.created_at,
    atendimento: atendimentoDoAnexo(d.atendimento),
    enviadoEm:   d.enviado_em,
    enviadoPor:  d.enviado_por_nome,
    momento:     d.momento,
    appointmentId: d.atendimento?.id ?? null,
  })
  const documents = docsComuns.map(paraOItem)
  const anexosClinicos = docsClinicos.map(paraOItem)
  // PR2: as anotações e as versões de antes, só na aba que as mostra.
  const anotacoesEVersoesDaFicha = canViewRecords && aba === 'fichas'
    ? await anotacoesEVersoes(admin, ctx.tenantId!, recordForms.map(r => r.appointmentId))
    : undefined

  const canGrantCredit = ctx.permissions.financial === 'MANAGE'

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH:            'Dinheiro',
    PIX:             'Pix',
    DEBIT_CARD:      'Débito',
    CREDIT_CARD:     'Crédito',
    INTERNAL_CREDIT: 'Crédito interno',
  }

  // -- Unified client history ------------------------------------------------
  const appAccountCreatedAt = raw.app_account_created_at as string | null

  type RawHistoryPlan = { id: string; status: string; created_at: string; updated_at: string | null; aceito_em?: string | null; name: string | null; cancelado_em: string | null; cancelamento_motivo: string | null; cancelamento: unknown }

  let evIdx = 0
  const uid = (prefix: string) => `${prefix}-${evIdx++}`
  const history: ClientHistoryEvent[] = []

  // 1. Cadastro do cliente
  history.push({
    id: uid('cc'), date: raw.created_at,
    type: 'CLIENT_CREATED', title: 'Cliente cadastrado',
    subtitle: null, amount: null, link: null,
  })

  // 2. Conta no app
  if (appAccountCreatedAt) {
    history.push({
      id: uid('aa'), date: appAccountCreatedAt,
      type: 'APP_ACCOUNT', title: 'Primeiro acesso ao app',
      subtitle: null, amount: null, link: null,
    })
  }

  // F17-3: as notas que a cliente deu a cada procedimento, dos atendimentos que ela confirmou.
  // Abrir a tela do atendimento é do Atendimento em Ver (UM1, 23/11): sem ele, o
  // histórico e o anexo do atendimento ficam sem o link (o texto continua).
  const abreOAtendimento = can(ctx, 'atendimento', 'VIEW')
  const naLinhaDoTempo = aba === 'historico'
  const notasDasAvaliacoes = !naLinhaDoTempo ? new Map<string, never[]>() : await notasDosProcedimentos(admin,
    ((appts ?? []) as { id: string; client_confirmed_at?: string | null }[]).filter(a => a.client_confirmed_at).map(a => a.id))
  // 3. Agendamentos
  // F64: a hora do agendamento no relógio da unidade DELE (a ficha é da clínica, H5).
  const fusoDoAgendamento = new Map<string, string>()
  for (const b of naLinhaDoTempo ? new Set((appts ?? []).map(a => (a as { branch_id?: string | null }).branch_id ?? null)) : []) {
    fusoDoAgendamento.set(b ?? '', await fusoDaUnidade(ctx.tenantId, b))
  }
  for (const a of (appts ?? [])) {
    const proc = (a.procedures as { name?: string } | null)?.name ?? '—'
    const prof = (a.professional as { name?: string } | null)?.name ?? '—'
    const label = proc
    history.push(...eventosDeConfirmacaoEChegada(
      { id: a.id, procedureName: proc, confirmed_at: a.confirmed_at ?? null, arrived_at: a.arrived_at ?? null }, linkDoAtendimento(abreOAtendimento, `/${slug}`, a.id)))
    // A avaliação que a cliente deixou no app, com o comentário (J-26).
    const avaliacao = eventoDaAvaliacao({ id: a.id, procedureName: proc, client_confirmed_at: a.client_confirmed_at,
      procedure_rating: a.procedure_rating, client_rating: a.client_rating, client_feedback: a.client_feedback,
      notas_dos_procedimentos: notasDasAvaliacoes.get(a.id) ?? [] }, linkDoAtendimento(abreOAtendimento, `/${slug}`, a.id))
    if (avaliacao) history.push(avaliacao)

    if (a.status === 'COMPLETED' && a.completed_at) {
      history.push({
        id: uid('ac'), date: a.completed_at,
        type: 'APPOINTMENT_COMPLETED',
        title: `Atendimento: ${label}`,
        subtitle: `com ${prof}`,
        amount: parseFloat(String(a.price ?? 0)),
        link: linkDoAtendimento(abreOAtendimento, `/${slug}`, a.id),
        agendamentoId: a.id,
      })
    } else if (a.status === 'CANCELLED' && a.cancelled_at) {
      history.push({
        id: uid('ax'), date: a.cancelled_at,
        type: 'APPOINTMENT_CANCELLED',
        title: `Cancelado: ${label}`,
        subtitle: null, amount: null,
        link: linkDoAtendimento(abreOAtendimento, `/${slug}`, a.id),
        agendamentoId: a.id,
      })
    } else if (a.status === 'NO_SHOW') {
      history.push({
        id: uid('an'), date: a.scheduled_at,
        type: 'APPOINTMENT_NO_SHOW',
        title: `Não compareceu: ${label}`,
        subtitle: null, amount: null,
        link: linkDoAtendimento(abreOAtendimento, `/${slug}`, a.id),
        agendamentoId: a.id,
      })
    } else {
      const evDate = a.created_at ?? a.scheduled_at
      history.push({
        id: uid('as'), date: evDate,
        type: 'APPOINTMENT_SCHEDULED',
        title: `Agendamento: ${label}`,
        subtitle: `${formatarNoFuso(a.scheduled_at, "dd/MM/yyyy 'às' HH:mm", fusoDoAgendamento.get((a as { branch_id?: string | null }).branch_id ?? ''))} · ${prof}`,
        amount: null,
        link: linkDoAtendimento(abreOAtendimento, `/${slug}`, a.id),
        agendamentoId: a.id,
      })
    }
  }

  // 4. Pagamentos (somente pagos, sem duplicatas)
  for (const tx of transactions) {
    if (tx.isPaid) {
      const txTitle = tx.procedureName
        ? `Pagamento: ${tx.procedureName}`
        : (tx.description || 'Pagamento recebido')
      history.push({
        id: uid('pay'), date: tx.paidAt ?? tx.createdAt,
        type: 'PAYMENT',
        title: txTitle,
        subtitle: tx.paymentMethod ? (PAYMENT_METHOD_LABELS[tx.paymentMethod] ?? tx.paymentMethod) : null,
        amount: tx.amount,
        link: null,
      })
    }
  }

  // 5. Planos de tratamento (todos os statuses)
  for (const plan of ((allPlansHistRaw as RawHistoryPlan[] | null) ?? [])) {
    if (plan.status === 'DRAFT' || plan.status === 'PROPOSED') {
      history.push({
        id: uid('pp'), date: plan.created_at,
        type: 'PLAN_PROPOSED',
        title: 'Plano de tratamento proposto',
        subtitle: null, amount: null, link: null,
      })
    } else if (plan.status === 'ACCEPTED') {
      history.push({
        // A hora do ACEITE gravada (aceito_em), não a última mudança do plano (princípio 3).
        id: uid('pa'), date: plan.aceito_em ?? plan.updated_at ?? plan.created_at,
        type: 'PLAN_ACCEPTED',
        title: 'Plano de tratamento aceito',
        // O aceite é a cliente dizer sim, sem dinheiro (PT1b): não houve checkout.
        subtitle: null,
        amount: null, link: null,
      })
    } else if (plan.cancelado_em) {
      // O plano fechado cancelado (D4 da 9ª): a conta, como o do pacote.
      const cancelado = historicoDoCancelamento(plan, plan.name?.trim() || 'Plano de tratamento', formatBRL, 'Plano')
      if (cancelado) history.push({ id: uid('pc'), type: 'PLAN_CANCELLED', link: null, ...cancelado })
    } else if (plan.status === 'CANCELLED' || plan.status === 'REJECTED') {
      history.push({
        id: uid('pc'), date: plan.updated_at ?? plan.created_at,
        type: 'PLAN_CANCELLED',
        title: 'Plano de tratamento cancelado',
        subtitle: null, amount: null, link: null,
      })
    }
  }

  // 6. Pacotes adquiridos
  for (const pkg of pkgsArray) {
    const sp       = pkg.service_packages as { name?: string; price?: number } | null
    const pkgDate  = (pkg as { purchased_at?: string | null }).purchased_at ?? undefined
    if (pkgDate) {
      history.push({
        id: uid('pkg'), date: pkgDate,
        type: 'PACKAGE_PURCHASED',
        link: null,
        ...linhaDoHistoricoDoPacote(pkg as { de_fora?: boolean; total_sessions: number; usadas_antes?: number }, sp?.name ?? 'Pacote', Number(sp?.price ?? 0)),
      })
    }
    const cancelado = historicoDoCancelamento(pkg as { cancelado_em?: string | null }, sp?.name ?? 'Pacote', formatBRL)
    if (cancelado) history.push({ id: uid('pkgc'), type: 'PACKAGE_CANCELLED', link: null, ...cancelado })
  }

  // 7. Termos e contratos assinados (os novos e o legado do checkout antigo)
  // A linha do tempo (doc-03, 2026-11-02: "o histórico não é dado clínico, é
  // o histórico de ações feitas no cliente dentro do sistema"): o "Assinado:
  // <título>" aparece a quem vê a ficha. A linha leva só o título do modelo e
  // o canal — nada do conteúdo.
  for (const doc of naLinhaDoTempo ? await assinadosDoCliente(ctx.tenantId, id) : []) {
    history.push({
      id: uid('ct'), date: doc.assinadoEm,
      type: 'CONSENT_SIGNED',
      title: `Assinado: ${doc.titulo}`,
      subtitle: doc.canal ? SUBTITULO_DO_CANAL[doc.canal] ?? null : null,
      amount: null, link: null,
    })
  }

  // 8. O "Unificar com a ficha" do cadastro (A23 da 7ª simulação), da corrente de eventos.
  for (const u of naLinhaDoTempo ? await unificacoesDaFicha(admin, ctx.tenantId!, id) : []) {
    history.push({ id: uid('un'), date: u.date, type: 'CLIENT_UNIFIED', title: 'Ficha unificada pelo cadastro', subtitle: u.subtitle, amount: null, link: null, autor: u.autor })
  }

  // Quem fez cada ação (J-27): o nome que appointment_history guardou. E as
  // remarcações, de quando para quando, com quem remarcou (A2 da 31ª).
  const historicoDosAg = !naLinhaDoTempo ? [] : await historicoDosAgendamentos(admin, (appts ?? []).map(a => a.id as string))
  history.push(...eventosDeRemarcacao(historicoDosAg,
    new Map((appts ?? []).map(a => [a.id as string, (a.procedures as { name?: string } | null)?.name ?? '—'])),
    id => linkDoAtendimento(abreOAtendimento, `/${slug}`, id)))
  const clientHistory = !naLinhaDoTempo ? [] : comAutores(history, historicoDosAg)
    .sort((a, b) => b.date.localeCompare(a.date))

  // Procedimentos e insumos do editor de plano — a aba Planejamento monta o
  // plano do cliente sem depender de nenhum atendimento.
  const planoProcs = await procedimentosParaPlano(ctx.tenantId!, branch.id as string)

  // Negociacoes desta pessoa: ser cliente nao encerra o funil -- reativacao e
  // abrir oportunidade nova para quem ja comprou.
  const oportunidades = aba === 'oportunidades' ? await oportunidadesDoCliente(ctx, client.id) : []

  // O resto do que a ficha mostra, de uma vez (C77): eram leituras uma atrás
  // da outra no meio da montagem da tela.
  // Os documentos da cliente: de quem vê a ficha, com os Documentos no plano
  // (o Heitor, 2026-11-16: o módulo Documentos é o dos MODELOS; colher não pede
  // permissão de documento). Dispensar é de quem responde pelos modelos.
  const veTermos = veOsDocumentos(ctx)
  const [pedidoLgpd, termosItens, pelaConversa, prePagos, quemDesfaz, pagoComCredito, fidelidade] = await Promise.all([
    pedidoLgpdDaFicha(ctx, id, slug),
    veTermos ? documentosDoCliente(ctx.tenantId!, id) : Promise.resolve([]),
    veTermos ? envioPelaConversaLigado(ctx.tenantId!) : Promise.resolve(false),
    prePagosDoCliente(ctx.tenantId!, id),
    podeReceber(ctx) && !can(ctx, 'financial', 'MANAGE') ? quemDesfazNoCaixa(ctx.tenantId!, branch.id as string) : Promise.resolve(null),
    getPagoComCreditoDoCliente(ctx.tenantId!, id),
    fidelidadeDoPerfil(ctx, id),
  ])

  // Sem o Clientes, a ficha inteira não chega a ser desenhada: vai só o
  // nome e o clínico (`soOProntuarioDaFicha`, a lista do que fica).
  const ficha = (
    <ClientProfile
      client={client}
      abreOAtendimento={abreOAtendimento}
      pedidoLgpd={pedidoLgpd}
      branchId={branch.id}
      stats={stats}
      upcomingAppointments={upcomingAppointments}
      recentAppointments={recentAppointments}
      allAppointments={allAppointments}
      recordForms={recordForms}
      lotesDosAtendimentos={lotesDosAtendimentosDaFicha}
      podeAbrirLote={can(ctx, 'stock', 'VIEW') && can(ctx, 'clients', 'VIEW')}
      anexosClinicosFora={anexosClinicosFora}
      anexosClinicos={anexosClinicos}
      anotacoesEVersoes={anotacoesEVersoesDaFicha}
      podeAnotar={can(ctx, 'medical_records', 'MANAGE') && canViewRecords}
      podeVerProntuario={canViewRecords}
      planejamentosQueAbrem={planejamentosQueAbrem}
      acessosAoProntuario={acessosDoProntuario}
      generalAnamnesis={generalAnamnesis}
      // UM4: responde a ficha de saúde quem tem o Prontuário em Gerenciar (a permissão de salvarAnamneseGeral).
      podeEditarFichaDeSaude={can(ctx, 'medical_records', 'MANAGE') && canViewRecords}
      fichaDeSaudeAtual={noProntuario ? fichaDeSaudeDaRede : null}
      alergias={alergias}
      fidelidade={fidelidade}
      activePackage={activePackage}
      outrosPacotes={outrosPacotes}
      transactions={transactions}
      veFinanceiro={veFinanceiro}
      totaisFinanceiros={financeiro.totais}
      internalCredits={internalCredits}
      documents={documents}
      termos={veTermos
          ? { itens: termosItens, podeDispensar: dispensaDocumentos(ctx), pelaConversa, portalNoPlano: temRecurso(ctx, 'portal') }
          : null}
      canGrantCredit={canGrantCredit}
      branches={(branchesRaw ?? []) as { id: string; name: string }[]}
      currentBranchId={branch.id}
      slug={slug}
      canManageProcedures={can(ctx, 'medical_records', 'MANAGE')}
      // Anexo clínico: o Prontuário em Gerenciar (e em Ver).
      podeAnexarClinico={can(ctx, 'medical_records', 'MANAGE') && canViewRecords}
      podeAnexarComum={can(ctx, 'clients', 'MANAGE')}
      portalNoPlano={temRecurso(ctx, 'portal')}
      planProcedures={planoProcs.procedures}
      planProducts={planoProcs.products}
      podeReceber={podeReceber(ctx)}
      // UM3: monta o plano quem tem o Atendimento em Gerenciar nesta unidade.
      podeMontarPlano={montaPlano(ctx, branch.id)}
      // Os injetáveis são de quem realiza o atendimento (o Heitor, 2026-11-23).
      podeEditarInjetaveis={can(ctx, 'atendimento', 'MANAGE') && canViewRecords}
      aReceber={aReceber}
      comandaParaReceber={comandaParaReceber}
      planosNaoRecebidos={planosNaoRecebidos}
      podeReceberAtendimento={podeReceber(ctx)}
      prePagos={prePagos}
      podeAgendar={can(ctx, 'agenda', 'MANAGE')}
      podeEditarCadastro={can(ctx, 'clients', 'MANAGE')}
      // A10 da 20ª: sem editar, o aviso do que falta diz quem completa o cadastro.
      quemCompletaOCadastro={can(ctx, 'clients', 'MANAGE') ? null : await quemCompletaOCadastro(ctx.tenantId!, branch.id)}
      podeExportarProntuario={can(ctx, 'medical_records', 'MANAGE')}
      podeVerPlanos={can(ctx, 'atendimento', 'VIEW')}
      podeIniciarAtendimento={can(ctx, 'atendimento', 'MANAGE')}
      podeCancelarPacote={podeEstornar(ctx)}
      pacoteVencido={pacoteVencido}
      podeRemarcar={can(ctx, 'financial', 'MANAGE')}
      // A32 e A35 da 12ª: estornar (o Financeiro em Gerenciar) e receber a parcela na ficha — quem dá baixa (CX2: o PDV ou o Financeiro em Gerenciar, `podeDarBaixa`, a mesma régua de markTransactionPaid).
      podeEstornar={podeEstornar(ctx)}
      podeReceberParcela={podeDarBaixa(ctx)}
      quemDesfaz={quemDesfaz}
      pagoComCredito={pagoComCredito}
      isNetworkWide={ctx.branchId === null}
      clientHistory={clientHistory}
      opportunities={oportunidades}
      // CRM-03 (18/11): as oportunidades são dado do CRM — sem ele (ou fora do plano), a aba some.
      veOportunidades={can(ctx, 'crm', 'VIEW') && temRecurso(ctx, 'oportunidades')}
    />
  )

  return (
    <>
    <RealtimeRefresher topicos={['agenda', 'pacotes']} />
    {soProntuario ? <ClientProfile {...soOProntuarioDaFicha(ficha.props as ClientProfileProps)} /> : ficha}
    </>
  )
}
