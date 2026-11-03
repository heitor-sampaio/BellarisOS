import { getTenantContext, assertClient } from '@/lib/auth'
import { getAtendimentosAReceber } from '@/lib/metrics/a-receber'
import { createAdminClient } from '@/lib/supabase/admin'
import { assinadosDoCliente } from '@/lib/documentos/leitura'
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
  /** O comentário que ela deixou ao avaliar (J-26: não voltava ao histórico). */
  feedback:            string | null
}

export type PagamentoItem = {
  id:             string
  description:    string
  amount:         number
  payment_method: string | null
  cartao_vezes:   number | null
  is_paid:        boolean
  paid_at:        string | null
  procedure_name: string | null
  /** O vencimento da parcela/conta a receber (A64), AAAA-MM-DD. */
  vencimento?:    string | null
  /** "Parcela 2 de 3" (A64). */
  parcela?:       string | null
  /** O atendimento avulso concluído e não pago (A64): não é um lançamento, é `atendimentos_a_receber`. */
  aPagarNaClinica?: boolean
  /** Estornado: o dinheiro voltou — não é "Pago" nem tem recibo (como o Financeiro do app). */
  estornado?:     boolean
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
  procedure_rating: number | null; client_rating: number | null; client_feedback: string | null
  procedures: { name: string } | null; professionals: { name: string } | null
}
type PagamentoLido = {
  id: string; description: string; amount: number | string; payment_method: string | null; cartao_vezes: number | null
  is_paid: boolean; paid_at: string | null; notes: string | null
  due_date: string | null; data_de_referencia: string | null; parcela_numero: number | null; parcela_total: number | null
  appointments: { procedures: { name: string } | null } | null
}
type DocumentoLido = { id: string; name: string; category: string; file_path: string; created_at: string }
const CANAL_NO_PORTAL: Record<string, string> = { CLINICA: 'na clínica', PAPEL: 'no papel', PORTAL: 'pelo portal', LINK: 'por link' }

export default async function HistoricoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  const [procedimentosRes, pagamentosRes, docsRes, consentRes] = await Promise.all([
    // Procedimentos = appointments concluídos
    ler(admin.from('appointments')
      .select('id, scheduled_at, client_confirmed_at, procedure_rating, client_rating, client_feedback, procedures(name), professionals:users!professional_id(name)')
      .eq('client_id', ctx.clientId!)
      .eq('status', 'COMPLETED')
      .order('scheduled_at', { ascending: false })
      .limit(50), 'carregar os atendimentos'),

    // Pagamentos = transações financeiras ligadas ao cliente
    ler(admin.from('financial_transactions')
      .select(`
        id, description, amount, payment_method, cartao_vezes, is_paid, paid_at, notes,
        due_date, data_de_referencia, parcela_numero, parcela_total,
        appointments(procedures(name))
      `)
      // Pela ficha, não pelo agendamento: o pagamento de um plano não tem
      // agendamento, e ficava fora da lista do próprio cliente.
      .eq('client_id', ctx.clientId!)
      .eq('type', 'INCOME')
      .order('created_at', { ascending: false })
      .limit(50), 'carregar os pagamentos'),

    // Documentos = só os arquivos que a clínica ENVIOU à cliente (decisão do
    // Heitor, 2026-10-30). A foto clínica, o exame e o laudo anexados ficam
    // com a equipe até alguém enviar pela ficha (`enviado_em`). A data é a
    // do envio.
    ler(admin.from('client_documents')
      .select('id, name, category, file_path, created_at:enviado_em')
      .eq('client_id', ctx.clientId!)
      .is('apagado_em', null)
      .not('enviado_em', 'is', null)
      .order('enviado_em', { ascending: false })
      .limit(30), 'carregar os documentos'),

    // Termos e contratos assinados (os de agora e o legado do checkout antigo).
    assinadosDoCliente(null, ctx.clientId!),
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
    feedback:            r.client_feedback?.trim() || null,
  }))

  // -- Pagamentos -------------------------------------------------
  const pagamentos: PagamentoItem[] = ((pagamentosRes ?? []) as unknown as PagamentoLido[]).map(r => ({
    id:             r.id,
    description:    r.description,
    amount:         Number(r.amount),
    payment_method: r.payment_method,
    cartao_vezes:   r.cartao_vezes,
    is_paid:        Boolean(r.is_paid),
    paid_at:        r.paid_at,
    procedure_name: r.appointments?.procedures?.name ?? null,
    estornado:      r.notes === 'Estornada',
    // A64: o vencimento e a parcela — "Pendente" sozinho não dizia quando.
    vencimento:     r.is_paid ? null : (r.due_date ?? r.data_de_referencia ?? null),
    parcela:        r.parcela_numero && r.parcela_total && r.parcela_total > 1 ? `Parcela ${r.parcela_numero} de ${r.parcela_total}` : null,
  }))
  // A64: o atendimento avulso concluído e não pago (a conta de
  // `atendimentos_a_receber`, a mesma do Fechamento e da ficha) — não tinha
  // lançamento, e não aparecia para a cliente.
  const ficha = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId!).maybeSingle(), 'buscar a ficha') as { tenant_id: string } | null
  const aReceber = ficha ? await getAtendimentosAReceber({ tenantId: ficha.tenant_id, clienteId: ctx.clientId! }) : null
  pagamentos.unshift(...(aReceber?.itens ?? []).map(a => ({
    id:             `a-receber-${a.appointmentId}`,
    description:    a.procedureName ?? 'Atendimento',
    amount:         a.price,
    payment_method: null,
    cartao_vezes:   null,
    is_paid:        false,
    paid_at:        null,
    procedure_name: a.procedureName,
    aPagarNaClinica: true,
  })))

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

  const consentDocs = consentRes.slice(0, 20).map(r => ({
    id:         r.id,
    title:      r.titulo,
    signed_at:  r.assinadoEm,
    signed_via: r.canal ? CANAL_NO_PORTAL[r.canal] ?? null : null,
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
