import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { CLIENT_DOCS_BUCKET, getSignedUrls } from '@/lib/storage'
import { HistoricoTabs } from '@/components/client-portal/historico-tabs'

// -- Types ----------------------------------------------------------
export type ProcedimentoItem = {
  id:                  string
  scheduled_at:        string
  procedure_name:      string
  professional_name:   string | null
  confirmed:           boolean
  procedure_rating:    number | null
  professional_rating: number | null
}

export type PagamentoItem = {
  id:             string
  description:    string
  amount:         number
  payment_method: string | null
  is_paid:        boolean
  paid_at:        string | null
  procedure_name: string | null
}

export type DocumentoItem = {
  id:         string
  name:       string
  category:   string
  file_url:   string
  created_at: string
} | {
  id:         string
  title:      string
  signed_at:  string
  signed_via: string | null
  kind:       'consent'
}

// -- Linhas como os selects as pedem ------------------------------
type AtendimentoLido = {
  id: string; scheduled_at: string; client_confirmed_at: string | null
  procedure_rating: number | null; client_rating: number | null
  procedures: { name: string } | null; professionals: { name: string } | null
}
type PagamentoLido = {
  id: string; description: string; amount: number | string; payment_method: string | null
  is_paid: boolean; paid_at: string | null
  appointments: { procedures: { name: string } | null } | null
}
type DocumentoLido = { id: string; name: string; category: string; file_path: string; created_at: string }
type TermoLido     = { id: string; title: string; signed_at: string; signed_via: string | null }

export default async function HistoricoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  const [procedimentosRes, pagamentosRes, docsRes, consentRes] = await Promise.all([
    // Procedimentos = appointments concluídos
    ler(admin.from('appointments')
      .select('id, scheduled_at, client_confirmed_at, procedure_rating, client_rating, procedures(name), professionals:users!professional_id(name)')
      .eq('client_id', ctx.clientId!)
      .eq('status', 'COMPLETED')
      .order('scheduled_at', { ascending: false })
      .limit(50), 'carregar os atendimentos'),

    // Pagamentos = transações financeiras ligadas ao cliente
    ler(admin.from('financial_transactions')
      .select(`
        id, description, amount, payment_method, is_paid, paid_at,
        appointments(procedures(name))
      `)
      // Pela ficha, não pelo agendamento: o pagamento de um plano não tem
      // agendamento, e ficava fora da lista do próprio cliente.
      .eq('client_id', ctx.clientId!)
      .eq('type', 'INCOME')
      .order('created_at', { ascending: false })
      .limit(50), 'carregar os pagamentos'),

    // Documentos = arquivos enviados pela clínica para o cliente
    ler(admin.from('client_documents')
      .select('id, name, category, file_path, created_at')
      .eq('client_id', ctx.clientId!)
      .order('created_at', { ascending: false })
      .limit(30), 'carregar os documentos'),

    // Termos de consentimento assinados (via prontuário)
    ler(admin.from('consent_terms')
      .select('id, title, signed_at, signed_via, medical_records!inner(client_id)')
      .eq('medical_records.client_id', ctx.clientId!)
      .not('signed_at', 'is', null)
      .order('signed_at', { ascending: false })
      .limit(20), 'carregar os termos assinados'),
  ])

  // -- Procedimentos ----------------------------------------------
  const procedimentos: ProcedimentoItem[] = ((procedimentosRes ?? []) as unknown as AtendimentoLido[]).map(r => ({
    id:                  r.id,
    scheduled_at:        r.scheduled_at,
    procedure_name:      r.procedures?.name ?? 'Procedimento',
    professional_name:   r.professionals?.name ?? null,
    confirmed:           r.client_confirmed_at != null,
    procedure_rating:    r.procedure_rating != null ? Number(r.procedure_rating) : null,
    professional_rating: r.client_rating != null ? Number(r.client_rating) : null,
  }))

  // -- Pagamentos -------------------------------------------------
  const pagamentos: PagamentoItem[] = ((pagamentosRes ?? []) as unknown as PagamentoLido[]).map(r => ({
    id:             r.id,
    description:    r.description,
    amount:         Number(r.amount),
    payment_method: r.payment_method,
    is_paid:        Boolean(r.is_paid),
    paid_at:        r.paid_at,
    procedure_name: r.appointments?.procedures?.name ?? null,
  }))

  // -- Documentos -------------------------------------------------
  const rawDocs = (docsRes ?? []) as unknown as DocumentoLido[]
  const docUrlMap = await getSignedUrls(CLIENT_DOCS_BUCKET, rawDocs.map(r => r.file_path))
  const clientDocs = rawDocs.map(r => ({
    id:         r.id,
    name:       r.name,
    category:   r.category,
    file_url:   docUrlMap[r.file_path] ?? '',
    created_at: r.created_at,
  }))

  const consentDocs = ((consentRes ?? []) as unknown as TermoLido[]).map(r => ({
    id:         r.id,
    title:      r.title,
    signed_at:  r.signed_at,
    signed_via: r.signed_via,
    kind:       'consent' as const,
  }))

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 20 }}>
        Histórico
      </h1>
      <HistoricoTabs
        slug={slug}
        procedimentos={procedimentos}
        pagamentos={pagamentos}
        documentos={clientDocs}
        consentimentos={consentDocs}
      />
    </div>
  )
}
