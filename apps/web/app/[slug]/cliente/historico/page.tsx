import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
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

export default async function HistoricoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertRole(ctx, ['CLIENT'])

  const admin = createAdminClient()

  const [procedimentosRes, pagamentosRes, docsRes, consentRes] = await Promise.all([
    // Procedimentos = appointments concluídos
    admin.from('appointments')
      .select('id, scheduled_at, client_confirmed_at, procedure_rating, client_rating, procedures(name), professionals:users!professional_id(name)')
      .eq('client_id', ctx.clientId!)
      .eq('status', 'COMPLETED')
      .order('scheduled_at', { ascending: false })
      .limit(50),

    // Pagamentos = transações financeiras ligadas ao cliente
    admin.from('financial_transactions')
      .select(`
        id, description, amount, payment_method, is_paid, paid_at,
        appointments!inner(client_id, procedures(name))
      `)
      .eq('appointments.client_id', ctx.clientId!)
      .eq('type', 'INCOME')
      .order('created_at', { ascending: false })
      .limit(50),

    // Documentos = arquivos enviados pela clínica para o cliente
    admin.from('client_documents')
      .select('id, name, category, file_path, created_at')
      .eq('client_id', ctx.clientId!)
      .order('created_at', { ascending: false })
      .limit(30),

    // Termos de consentimento assinados (via prontuário)
    admin.from('consent_terms')
      .select('id, title, signed_at, signed_via, medical_records!inner(client_id)')
      .eq('medical_records.client_id', ctx.clientId!)
      .not('signed_at', 'is', null)
      .order('signed_at', { ascending: false })
      .limit(20),
  ])

  // -- Procedimentos ----------------------------------------------
  const procedimentos: ProcedimentoItem[] = (procedimentosRes.data ?? []).map((r: any) => ({
    id:                  r.id as string,
    scheduled_at:        r.scheduled_at as string,
    procedure_name:      (r.procedures as { name: string } | null)?.name ?? 'Procedimento',
    professional_name:   (r.professionals as { name: string } | null)?.name ?? null,
    confirmed:           r.client_confirmed_at != null,
    procedure_rating:    r.procedure_rating != null ? Number(r.procedure_rating) : null,
    professional_rating: r.client_rating != null ? Number(r.client_rating) : null,
  }))

  // -- Pagamentos -------------------------------------------------
  const pagamentos: PagamentoItem[] = (pagamentosRes.data ?? []).map((r: any) => ({
    id:             r.id as string,
    description:    r.description as string,
    amount:         Number(r.amount),
    payment_method: r.payment_method as string | null,
    is_paid:        Boolean(r.is_paid),
    paid_at:        r.paid_at as string | null,
    procedure_name: (r.appointments?.procedures as { name: string } | null)?.name ?? null,
  }))

  // -- Documentos -------------------------------------------------
  const rawDocs = (docsRes.data ?? []) as any[]
  const docUrlMap = await getSignedUrls(CLIENT_DOCS_BUCKET, rawDocs.map(r => r.file_path as string))
  const clientDocs = rawDocs.map((r: any) => ({
    id:         r.id as string,
    name:       r.name as string,
    category:   r.category as string,
    file_url:   docUrlMap[r.file_path as string] ?? '',
    created_at: r.created_at as string,
  }))

  const consentDocs = (consentRes.data ?? []).map((r: any) => ({
    id:         r.id as string,
    title:      r.title as string,
    signed_at:  r.signed_at as string,
    signed_via: r.signed_via as string | null,
    kind:       'consent' as const,
  }))

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 20 }}>
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
