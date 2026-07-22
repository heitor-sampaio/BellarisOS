import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

type TxRow = {
  id:             string
  description:    string
  amount:         number
  payment_method: string | null
  is_paid:        boolean
  paid_at:        string | null
  created_at:     string
  procedure_name: string | null
}

const METHOD_LABEL: Record<string, string> = {
  CASH:            'Dinheiro',
  PIX:             'Pix',
  DEBIT_CARD:      'Débito',
  CREDIT_CARD:     'Crédito',
  INTERNAL_CREDIT: 'Crédito interno',
}

export default async function ClientFinancialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: _slug } = await params
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  const { data } = await admin
    .from('financial_transactions')
    .select(`
      id, description, amount, payment_method, is_paid, paid_at, created_at,
      appointments!inner(
        client_id,
        procedures(name)
      )
    `)
    .eq('appointments.client_id', ctx.clientId!)
    .eq('type', 'INCOME')
    .order('created_at', { ascending: false })

  const rows: TxRow[] = (data ?? []).map((r: any) => ({
    id:             r.id as string,
    description:    r.description as string,
    amount:         Number(r.amount),
    payment_method: r.payment_method as string | null,
    is_paid:        Boolean(r.is_paid),
    paid_at:        r.paid_at as string | null,
    created_at:     r.created_at as string,
    procedure_name: (r.appointments?.procedures as { name: string } | null)?.name ?? null,
  }))

  const total = rows.filter(r => r.is_paid).reduce((s, r) => s + r.amount, 0)

  return (
    <div>
      <h1 style={{
        fontSize:      'clamp(20px, 4vw, 26px)',
        fontWeight:    800,
        color:         'var(--text)',
        letterSpacing: '-0.02em',
        marginBottom:  24,
      }}>
        Financeiro
      </h1>

      {/* KPI */}
      <div className="card" style={{ padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Total investido</p>
        <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.02em' }}>
          R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {rows.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 14, padding: '48px 0' }}>
          Nenhuma transação encontrada.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.id} className="card" style={{ padding: '13px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5, marginBottom: 2 }}>
                {r.procedure_name ?? r.description}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {r.paid_at
                  ? new Date(r.paid_at).toLocaleDateString('pt-BR')
                  : new Date(r.created_at).toLocaleDateString('pt-BR')}
                {r.payment_method && ` · ${METHOD_LABEL[r.payment_method] ?? r.payment_method}`}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                R$ {r.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <span style={{
                fontSize:   10.5,
                fontWeight: 700,
                color:      r.is_paid ? '#22c55e' : '#f59e0b',
              }}>
                {r.is_paid ? 'Pago' : 'Pendente'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
