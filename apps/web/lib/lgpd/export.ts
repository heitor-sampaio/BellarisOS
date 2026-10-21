import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDia } from '@estetica-os/utils'
import { textoDoProntuarioForaDoPacote, type SituacaoDoProntuario } from '@/lib/lgpd/situacao-do-prontuario'
import { buildPdf, type PdfSection } from '@/lib/pdf'
import { ensurePrivateBucket, DOCUMENTOS_ASSINADOS_BUCKET } from '@/lib/storage'
import { formatBRL, formatDate, formatDateTime, maskCPF, maskPhone } from '@estetica-os/utils'
import { rotuloDoLancamento } from '@/lib/fidelidade/formato'
import { flattenFields, type AnamnesisRow } from '@/lib/anamnesis'

/**
 * Monta o pacote de dados pessoais de um cliente (LGPD art. 18, II e V).
 *
 * O pacote base — cadastro, agenda, financeiro, fidelidade, comunicações — sai
 * sempre. A parte clínica (anamnese, evolução, fotos) só entra quando
 * alguém da equipe com permissão de prontuário aprova o pedido: o produto não
 * expõe prontuário no autoatendimento, e são dados sensíveis de saúde.
 */

export const LGPD_BUCKET = 'lgpd-exports'

/** Quanto tempo o pacote fica disponível para download. */
export const EXPORT_TTL_DAYS = 30

type Json = Record<string, unknown>

const fmtDate     = (v: string | null | undefined) => (v ? formatDate(v) : '—')
const fmtDateTime = (v: string | null | undefined) => (v ? formatDateTime(v) : '—')
const fmtMoney    = (v: unknown) => formatBRL(Number(v ?? 0))

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', ARRIVED: 'Chegou', IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído', CANCELLED: 'Cancelado', NO_SHOW: 'Não compareceu',
}

// A ficha de saúde (pré-atendimento, 2026-10-21): o histórico em palavras.
const SITUACAO_DA_FICHA: Record<string, string> = { PENDENTE: 'Pendente', RESPONDIDO: 'Respondida', CANCELADO: 'Cancelada' }
const TIPO_DA_FICHA: Record<string, string> = { COMPLETO: 'Ficha completa', CONFIRMAR: 'Confirmação ("algo mudou?")' }
const QUEM_RESPONDEU: Record<string, string> = {
  CLIENTE_APP: 'a cliente, pelo app', CLIENTE_LINK: 'a cliente, pelo link', EQUIPE: 'a equipe da clínica',
}

/** As respostas da ficha, pergunta a pergunta, com o rótulo da ficha do envio. */
function respostasLegiveis(ficha: unknown, respostas: unknown): { pergunta: string; resposta: string }[] {
  const rows = ((ficha as { rows?: AnamnesisRow[] } | null)?.rows ?? []) as AnamnesisRow[]
  const r = (respostas && typeof respostas === 'object' ? respostas : {}) as Record<string, unknown>
  return flattenFields({ rows })
    .filter(c => c.type !== 'section' && r[c.id] !== undefined && r[c.id] !== null && r[c.id] !== '')
    .map(c => ({ pergunta: c.label, resposta: Array.isArray(r[c.id]) ? (r[c.id] as unknown[]).map(String).join(', ') : String(r[c.id]) }))
}

export type ExportResult = { jsonPath: string; pdfPath: string; expiresAt: Date }

export async function buildClientExport(
  requestId: string,
  clientId: string,
  includeMedical: boolean,
  /** A situação do pedido do prontuário (`lgpd_requests.medical_status`): o que dizer quando ele não vai. */
  situacaoDoProntuario: SituacaoDoProntuario = null,
): Promise<ExportResult> {
  const foraDoPacote = textoDoProntuarioForaDoPacote(situacaoDoProntuario)
  const admin = createAdminClient()

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (clientErr || !client) {
    throw new Error(`Cliente não encontrado: ${clientErr?.message ?? clientId}`)
  }

  // Num pedido de LGPD, entregar dados incompletos em silêncio é pior do que
  // falhar: o titular receberia um pacote que parece completo e não é. Por isso
  // cada consulta é verificada, e qualquer erro aborta a geração.
  function unwrap<T>(label: string, res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`Falha ao reunir ${label}: ${res.error.message}`)
    return res.data
  }

  const [
    apptRes, txRes, creditRes, loyaltyRes, packageRes,
    documentRes, notificationRes, planRes, branchRes, termosRes, prePagoRes, fichasRes,
  ] = await Promise.all([
    // `users` é desambiguado pela FK: appointments referencia users duas vezes
    // (professional_id e created_by_id) e o embed sem qualificação falha com
    // PGRST201 — o que antes deixava a lista de atendimentos vazia.
    admin.from('appointments')
      .select('scheduled_at, status, price, duration_min, source, client_notes, cancellation_reason, completed_at, branch_id, procedures(name), users!appointments_professional_id_fkey(name)')
      .eq('client_id', clientId).order('scheduled_at', { ascending: false }),
    admin.from('financial_transactions')
      .select('created_at, paid_at, type, category, description, amount, payment_method, is_paid, branch_id')
      .eq('client_id', clientId).order('created_at', { ascending: false }),
    admin.from('internal_credits')
      .select('created_at, amount, description, branch_id').eq('client_id', clientId),
    admin.from('loyalty_accounts')
      // O saldo é a SOMA do extrato (balance deixou de ser escrito em 2026-09-28).
      .select('created_at, loyalty_transactions(created_at, kind, points, description, branches(name))')
      .eq('client_id', clientId).maybeSingle(),
    admin.from('client_packages')
      .select('purchased_at, expires_at, total_sessions, used_sessions, service_packages(name)')
      .eq('client_id', clientId),
    admin.from('client_documents')
      .select('created_at, name, category, file_name, mime_type, file_size').eq('client_id', clientId),
    admin.from('client_notifications')
      .select('created_at, title, body, type, is_read').eq('client_id', clientId)
      .order('created_at', { ascending: false }).limit(200),
    admin.from('treatment_plans')
      .select('created_at, status, branch_id').eq('client_id', clientId),
    admin.from('branches').select('id, name').eq('tenant_id', client.tenant_id),
    // Termos e contratos (§9.4.1): na parte GERAL, porque não carregam dado
    // clínico (o catálogo de variáveis não tem nenhum). Com as evidências do
    // próprio titular — ele tem direito de saber de que aparelho assinou.
    admin.from('issued_documents')
      .select('created_at, title, kind, status, moment, signed_at, verification_code, content_sha256, signed_pdf_sha256, signed_pdf_path, content_text, closed_reason, document_signatures(channel, identity_method, signed_at, ip, user_agent, accepted_text)')
      .eq('client_id', clientId).neq('status', 'A_GERAR').order('created_at', { ascending: false }),
    // Procedimentos pré-pagos (2026-09-30): o que comprou e o que usou.
    admin.from('procedure_sales')
      .select('sold_at, expires_at, quantity, preco_tabela, desconto, price, procedures(name), procedure_sale_units(numero, status, used_at, cancelled_at)')
      .eq('client_id', clientId).order('sold_at', { ascending: false }),
    // A ficha de saúde (pré-atendimento): só o HISTÓRICO na parte geral —
    // quando foi mandada, a situação, quando e por onde foi respondida. As
    // perguntas e respostas são de saúde: vão com o prontuário.
    admin.from('pre_atendimentos')
      .select('created_at, status, modo, origem, respondido_em')
      .eq('client_id', clientId).order('created_at', { ascending: false }),
  ])

  const appointments  = unwrap('os agendamentos', apptRes)
  const transactions  = unwrap('as transações', txRes)
  const credits       = unwrap('os créditos', creditRes)
  const loyalty       = unwrap('a fidelidade', loyaltyRes)
  const packages      = unwrap('os pacotes', packageRes)
  const documents     = unwrap('os documentos', documentRes)
  const notifications = unwrap('as comunicações', notificationRes)
  const plans         = unwrap('os planos de tratamento', planRes)
  const branches      = unwrap('as unidades', branchRes)
  const termos        = unwrap('os termos e contratos', termosRes)
  const prePagos      = unwrap('os procedimentos pré-pagos', prePagoRes)
  const fichasDeSaude = (unwrap('as fichas de saúde', fichasRes) ?? []).map(p => ({
    enviadaEm:     p.created_at as string,
    tipo:          TIPO_DA_FICHA[p.modo as string] ?? String(p.modo),
    situacao:      SITUACAO_DA_FICHA[p.status as string] ?? String(p.status),
    respondidaEm:  (p.respondido_em as string | null) ?? null,
    respondidaPor: p.origem ? QUEM_RESPONDEU[p.origem as string] ?? String(p.origem) : null,
  }))

  const branchName = new Map((branches ?? []).map(b => [b.id as string, b.name as string]))
  const unit = (id: string | null | undefined) => (id ? branchName.get(id) ?? '—' : '—')

  // ─── Parte clínica (só com aprovação) ──────────────────────────────────────
  let medical: Json | null = null
  if (includeMedical) {
    const recordRes = await admin
      .from('medical_records')
      .select('created_at, general_anamnesis, medical_record_entries(created_at, notes, intercurrences, products_used, form_data, appointment_id, users(name), record_photos(created_at, type, source))')
      .eq('client_id', clientId)
      .maybeSingle()

    const record = unwrap('o prontuário', recordRes)
    const respondidas = unwrap('as respostas das fichas de saúde', await admin.from('pre_atendimentos')
      .select('respondido_em, origem, ficha, respostas')
      .eq('client_id', clientId).eq('status', 'RESPONDIDO').order('respondido_em', { ascending: false }))
    const fichasRespondidas = (respondidas ?? []).map(p => ({
      respondidaEm:  p.respondido_em as string | null,
      respondidaPor: p.origem ? QUEM_RESPONDEU[p.origem as string] ?? String(p.origem) : null,
      ficha:         ((p.ficha as { nome?: string } | null)?.nome) ?? 'Pré-atendimento',
      respostas:     respostasLegiveis(p.ficha, p.respostas),
    }))

    if (record || fichasRespondidas.length) {
      medical = {
        criadoEm:      record?.created_at ?? null,
        anamneseGeral: record?.general_anamnesis ?? null,
        atendimentos:  record?.medical_record_entries ?? [],
        fichasDeSaude: fichasRespondidas,
      }
    }
  }

  // ─── JSON (portabilidade) ──────────────────────────────────────────────────
  const payload: Json = {
    geradoEm: new Date().toISOString(),
    aviso: 'Documento gerado a pedido do titular, nos termos da Lei 13.709/2018 (LGPD).',
    solicitacao: { id: requestId, incluiProntuario: includeMedical },
    cadastro: {
      nome: client.name, cpf: client.document, email: client.email, telefone: client.phone,
      dataNascimento: client.birth_date, genero: client.gender,
      endereco: {
        logradouro: client.address, numero: client.address_number,
        complemento: client.address_complement, bairro: client.neighborhood,
        cidade: client.city, estado: client.state, cep: client.zip_code,
      },
      unidadeDeCadastro: unit(client.branch_id),
      tags: client.tags,
      clienteDesde: client.created_at,
      contaNoApp: {
        criadaEm: client.app_account_created_at,
        ultimoAcesso: client.last_app_login_at,
      },
    },
    agendamentos: appointments ?? [],
    financeiro:   { transacoes: transactions ?? [], creditos: credits ?? [] },
    fidelidade:   loyalty ?? null,
    pacotes:      packages ?? [],
    procedimentosPrePagos: prePagos ?? [],
    documentos:   documents ?? [],
    // O que o titular assinou: o texto, o hash e as evidências. O PDF assinado
    // de cada um vai junto no pacote (pasta documentos/).
    termosEContratos: (termos ?? []).map(t => Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'signed_pdf_path'))),
    planosDeTratamento: plans ?? [],
    fichasDeSaude,
    comunicacoes: notifications ?? [],
    prontuario:   includeMedical ? medical : foraDoPacote.json,
  }

  // ─── PDF (leitura) ─────────────────────────────────────────────────────────
  const sections: PdfSection[] = [
    {
      title: 'Dados cadastrais',
      fields: [
        ['Nome', String(client.name ?? '—')],
        ['CPF', client.document ? maskCPF(String(client.document)) : '—'],
        ['E-mail', String(client.email ?? '—')],
        ['Telefone', client.phone ? maskPhone(String(client.phone)) : '—'],
        ['Data de nascimento', formatDia(client.birth_date) ?? '—'],
        ['Gênero', String(client.gender ?? '—')],
        ['Endereço', [client.address, client.address_number, client.address_complement, client.neighborhood, client.city, client.state, client.zip_code].filter(Boolean).join(', ') || '—'],
        ['Unidade de cadastro', unit(client.branch_id)],
        ['Cliente desde', fmtDate(client.created_at)],
        ['Conta no aplicativo', client.app_account_created_at ? `criada em ${fmtDate(client.app_account_created_at)}` : 'não possui'],
      ],
    },
    {
      title: `Agendamentos e atendimentos (${(appointments ?? []).length})`,
      emptyLabel: 'Nenhum agendamento registrado.',
      lines: (appointments ?? []).map(a => {
        const proc = (a.procedures as { name?: string } | null)?.name ?? 'Procedimento'
        const prof = (a.users as { name?: string } | null)?.name ?? '—'
        const st   = STATUS_LABEL[a.status as string] ?? String(a.status)
        return `${fmtDateTime(a.scheduled_at)} — ${proc} — ${st} — ${fmtMoney(a.price)} — profissional: ${prof} — unidade: ${unit(a.branch_id)}`
      }),
    },
    {
      title: `Transações financeiras (${(transactions ?? []).length})`,
      emptyLabel: 'Nenhuma transação registrada.',
      lines: (transactions ?? []).map(t =>
        `${fmtDate(t.paid_at ?? t.created_at)} — ${t.type === 'INCOME' ? 'Receita' : 'Despesa'} — ${String(t.description ?? '')} — ${fmtMoney(t.amount)} — ${t.is_paid ? 'pago' : 'em aberto'} — unidade: ${unit(t.branch_id)}`),
    },
    {
      title: `Créditos internos (${(credits ?? []).length})`,
      emptyLabel: 'Nenhum crédito registrado.',
      lines: (credits ?? []).map(c => `${fmtDate(c.created_at)} — ${fmtMoney(c.amount)} — ${String(c.description ?? '')}`),
    },
    {
      title: 'Programa de fidelidade',
      emptyLabel: 'Sem conta de fidelidade.',
      fields: loyalty ? [['Saldo de pontos', String(((loyalty.loyalty_transactions ?? []) as { points: number }[])
        .reduce((soma, l) => soma + Number(l.points), 0))]] : [],
      lines: ((loyalty?.loyalty_transactions ?? []) as unknown as { created_at: string; kind: string; points: number; description: string; branches: { name: string } | null }[])
        .map(t => `${fmtDate(t.created_at)} — ${rotuloDoLancamento(t.kind, t.description)} — ${t.points > 0 ? '+' : ''}${t.points} pontos — ${t.description ?? ''}${t.branches?.name ? ` (${t.branches.name})` : ''}`),
    },
    {
      title: `Pacotes (${(packages ?? []).length})`,
      emptyLabel: 'Nenhum pacote adquirido.',
      lines: (packages ?? []).map(p => {
        const nome = (p.service_packages as { name?: string } | null)?.name ?? 'Pacote'
        return `${fmtDate(p.purchased_at)} — ${nome} — ${p.used_sessions}/${p.total_sessions} sessões usadas`
      }),
    },
    {
      title: `Procedimentos pré-pagos (${(prePagos ?? []).length})`,
      emptyLabel: 'Nenhum procedimento pré-pago.',
      lines: (prePagos ?? []).map(v => {
        const nome = (v.procedures as { name?: string } | null)?.name ?? 'Procedimento'
        const unidades = (v.procedure_sale_units ?? []) as { status: string }[]
        const usadas = unidades.filter(u => u.status === 'USADA').length
        const canceladas = unidades.filter(u => u.status === 'CANCELADA').length
        return `${fmtDate(v.sold_at)} — ${v.quantity}× ${nome} — ${usadas} usada(s)${canceladas ? `, ${canceladas} cancelada(s)` : ''} — R$ ${Number(v.price).toFixed(2).replace('.', ',')}`
      }),
    },
    {
      title: `Documentos anexados (${(documents ?? []).length})`,
      emptyLabel: 'Nenhum documento anexado.',
      lines: (documents ?? []).map(d => `${fmtDate(d.created_at)} — ${String(d.name ?? d.file_name)} (${String(d.category ?? 'sem categoria')})`),
    },
    {
      title: `Termos e contratos (${(termos ?? []).length})`,
      emptyLabel: 'Nenhum termo ou contrato.',
      lines: (termos ?? []).map(t => {
        const assinatura = t.document_signatures as unknown as { channel?: string } | null
        const situacao = t.status === 'ASSINADO'
          ? `assinado em ${fmtDateTime(t.signed_at as string)}${assinatura?.channel ? ` (${String(assinatura.channel).toLowerCase()})` : ''} — código ${t.verification_code ?? '—'}`
          : String(t.status).toLowerCase()
        return `${fmtDate(t.created_at as string)} — ${String(t.title)} — ${situacao}`
      }),
    },
    {
      title: `Fichas de saúde — pré-atendimento (${fichasDeSaude.length})`,
      emptyLabel: 'Nenhuma ficha de saúde enviada.',
      lines: fichasDeSaude.map(p => `${fmtDate(p.enviadaEm)} — ${p.tipo} — ${p.situacao}`
        + (p.respondidaEm ? ` em ${fmtDateTime(p.respondidaEm)}` : '') + (p.respondidaPor ? ` por ${p.respondidaPor}` : '')),
    },
    {
      title: `Comunicações recebidas (${(notifications ?? []).length})`,
      emptyLabel: 'Nenhuma comunicação registrada.',
      lines: (notifications ?? []).slice(0, 50).map(n => `${fmtDate(n.created_at)} — ${String(n.title ?? '')}`),
    },
  ]

  if (includeMedical) {
    const entries = (medical?.atendimentos ?? []) as Record<string, unknown>[]
    const fichas = (medical?.fichasDeSaude ?? []) as { respondidaEm: string | null; respondidaPor: string | null; ficha: string; respostas: { pergunta: string; resposta: string }[] }[]
    sections.push(
      {
        title: `Prontuário — fichas de saúde respondidas (${fichas.length})`,
        emptyLabel: 'Nenhuma ficha de saúde respondida.',
        lines: fichas.flatMap(p => [
          `${fmtDateTime(p.respondidaEm)} — ${p.ficha}${p.respondidaPor ? ` — por ${p.respondidaPor}` : ''}`,
          ...p.respostas.map(r => `   ${r.pergunta}: ${r.resposta.replace(/\s+/g, ' ').trim()}`),
        ]),
      },
    )
    sections.push(
      {
        title: `Prontuário — registros de atendimento (${entries.length})`,
        emptyLabel: 'Nenhum registro de atendimento.',
        lines: entries.map(e => {
          const prof = (e.users as { name?: string } | null)?.name ?? '—'
          const fotos = ((e.record_photos ?? []) as unknown[]).length
          const notas = String(e.notes ?? '').replace(/\s+/g, ' ').trim()
          const inter = String(e.intercurrences ?? '').replace(/\s+/g, ' ').trim()
          return `${fmtDate(e.created_at as string)} — profissional: ${prof} — fotos: ${fotos}`
               + (notas ? ` — observações: ${notas}` : '')
               + (inter ? ` — intercorrências: ${inter}` : '')
        }),
      },
    )
  } else {
    sections.push({ title: 'Prontuário', lines: foraDoPacote.pdf })
  }

  sections.push({
    title: 'Sobre este documento',
    lines: [
      'Este relatório reúne os dados pessoais que mantemos sobre você, conforme',
      'o direito de acesso previsto no art. 18 da Lei 13.709/2018 (LGPD).',
      'O arquivo JSON que acompanha esta solicitação traz os mesmos dados em',
      'formato estruturado, para portabilidade.',
      `O download fica disponível por ${EXPORT_TTL_DAYS} dias a partir da geração.`,
    ],
  })

  const pdf = buildPdf({
    title:    'Relatório de dados pessoais',
    subtitle: `${client.name} · gerado em ${formatDateTime(new Date())}`,
    sections,
    footer:   'BellarisOS — documento gerado automaticamente a pedido do titular.',
  })

  // ─── Armazenamento ─────────────────────────────────────────────────────────
  await ensurePrivateBucket(LGPD_BUCKET)

  const base     = `${client.tenant_id}/${clientId}/${requestId}`
  const jsonPath = `${base}/dados.json`
  const pdfPath  = `${base}/relatorio.pdf`

  const jsonUp = await admin.storage.from(LGPD_BUCKET).upload(
    jsonPath, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    { contentType: 'application/json', upsert: true },
  )
  if (jsonUp.error) throw new Error(`Falha ao gravar o JSON: ${jsonUp.error.message}`)

  const pdfUp = await admin.storage.from(LGPD_BUCKET).upload(
    pdfPath, pdf, { contentType: 'application/pdf', upsert: true },
  )
  if (pdfUp.error) throw new Error(`Falha ao gravar o PDF: ${pdfUp.error.message}`)

  // Os PDFs assinados: uma cópia de cada no pacote. Falhou a cópia, falha o
  // pedido — o titular receberia um pacote que parece completo e não é.
  for (const t of termos ?? []) {
    if (!t.signed_pdf_path) continue
    const { data: arquivo, error: erroLeitura } = await admin.storage.from(DOCUMENTOS_ASSINADOS_BUCKET).download(t.signed_pdf_path as string)
    if (erroLeitura || !arquivo) throw new Error(`Falha ao ler o PDF assinado "${t.title}": ${erroLeitura?.message}`)
    const destino = `${base}/documentos/${String(t.verification_code ?? 'documento')}.pdf`
    const copia = await admin.storage.from(LGPD_BUCKET).upload(destino, Buffer.from(await arquivo.arrayBuffer()),
      { contentType: 'application/pdf', upsert: true })
    if (copia.error) throw new Error(`Falha ao copiar o PDF assinado "${t.title}": ${copia.error.message}`)
  }

  const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000)
  return { jsonPath, pdfPath, expiresAt }
}
