import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPdf, type PdfSection } from '@/lib/pdf'
import { ensurePrivateBucket, ANAMNESIS_BUCKET, CLIENT_DOCS_BUCKET } from '@/lib/storage'
import { formatBRL, formatDate, formatDateTime, maskCPF, maskPhone } from '@estetica-os/utils'

/**
 * Monta o pacote de dados pessoais de um cliente (LGPD art. 18, II e V).
 *
 * O pacote base — cadastro, agenda, financeiro, fidelidade, comunicações — sai
 * sempre. A parte clínica (anamnese, evolução, termos, fotos) só entra quando
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
  SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído', CANCELLED: 'Cancelado', NO_SHOW: 'Não compareceu',
}

export type ExportResult = { jsonPath: string; pdfPath: string; expiresAt: Date }

export async function buildClientExport(
  requestId: string,
  clientId: string,
  includeMedical: boolean,
): Promise<ExportResult> {
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
    documentRes, notificationRes, planRes, branchRes,
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
      .select('balance, created_at, loyalty_transactions(created_at, points, description)')
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

  const branchName = new Map((branches ?? []).map(b => [b.id as string, b.name as string]))
  const unit = (id: string | null | undefined) => (id ? branchName.get(id) ?? '—' : '—')

  // ─── Parte clínica (só com aprovação) ──────────────────────────────────────
  let medical: Json | null = null
  if (includeMedical) {
    // `consent_terms.procedure_id` não tem FK, então o procedimento não pode
    // ser embutido aqui — é resolvido depois, por consulta separada.
    const recordRes = await admin
      .from('medical_records')
      .select('created_at, general_anamnesis, medical_record_entries(created_at, notes, intercurrences, products_used, anamnesis_data, attendance_data, appointment_id, users(name), record_photos(created_at, type, source)), consent_terms(title, status, signed_at, signed_via, procedure_id)')
      .eq('client_id', clientId)
      .maybeSingle()

    const record = unwrap('o prontuário', recordRes)

    if (record) {
      const terms = (record.consent_terms ?? []) as Record<string, unknown>[]
      const procIds = [...new Set(terms.map(t => t.procedure_id).filter(Boolean))] as string[]
      const procName = new Map<string, string>()
      if (procIds.length) {
        const procRes = await admin.from('procedures').select('id, name').in('id', procIds)
        for (const p of unwrap('os procedimentos do prontuário', procRes) ?? []) {
          procName.set(p.id as string, p.name as string)
        }
      }

      medical = {
        criadoEm:      record.created_at,
        anamneseGeral: record.general_anamnesis,
        atendimentos:  record.medical_record_entries ?? [],
        termosConsentimento: terms.map(t => ({
          ...t,
          procedimento: t.procedure_id ? procName.get(t.procedure_id as string) ?? null : null,
        })),
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
    documentos:   documents ?? [],
    planosDeTratamento: plans ?? [],
    comunicacoes: notifications ?? [],
    prontuario:   includeMedical ? medical : 'Não incluído nesta solicitação.',
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
        ['Data de nascimento', fmtDate(client.birth_date)],
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
      fields: loyalty ? [['Saldo de pontos', String(loyalty.balance ?? 0)]] : [],
      lines: ((loyalty?.loyalty_transactions ?? []) as { created_at: string; points: number; description: string }[])
        .map(t => `${fmtDate(t.created_at)} — ${t.points > 0 ? '+' : ''}${t.points} pontos — ${t.description ?? ''}`),
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
      title: `Documentos anexados (${(documents ?? []).length})`,
      emptyLabel: 'Nenhum documento anexado.',
      lines: (documents ?? []).map(d => `${fmtDate(d.created_at)} — ${String(d.name ?? d.file_name)} (${String(d.category ?? 'sem categoria')})`),
    },
    {
      title: `Comunicações recebidas (${(notifications ?? []).length})`,
      emptyLabel: 'Nenhuma comunicação registrada.',
      lines: (notifications ?? []).slice(0, 50).map(n => `${fmtDate(n.created_at)} — ${String(n.title ?? '')}`),
    },
  ]

  if (includeMedical) {
    const entries = (medical?.atendimentos ?? []) as Record<string, unknown>[]
    const terms   = (medical?.termosConsentimento ?? []) as Record<string, unknown>[]
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
      {
        title: `Prontuário — termos de consentimento (${terms.length})`,
        emptyLabel: 'Nenhum termo registrado.',
        lines: terms.map(t => {
          const proc = (t.procedimento as string | null) ?? '—'
          return `${String(t.title ?? 'Termo')} — ${proc} — ${t.status === 'SIGNED' ? `assinado em ${fmtDate(t.signed_at as string)}` : 'pendente'}`
        }),
      },
    )
  } else {
    sections.push({
      title: 'Prontuário',
      lines: [
        'Os dados de prontuário (anamnese, evolução dos atendimentos, termos de',
        'consentimento e fotos clínicas) não fazem parte deste pacote. Para',
        'solicitá-los, procure a unidade onde você é atendido.',
      ],
    })
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

  const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000)
  return { jsonPath, pdfPath, expiresAt }
}

/** Buckets de onde saem os anexos citados no pacote (referência). */
export const REFERENCED_BUCKETS = [ANAMNESIS_BUCKET, CLIENT_DOCS_BUCKET]
