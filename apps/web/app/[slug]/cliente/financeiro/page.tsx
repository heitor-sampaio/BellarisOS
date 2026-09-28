import { getTenantContext, assertClient } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getDoCliente } from '@/lib/metrics/unidade'

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

/** Lançamento como o select pede, com o procedimento do agendamento (se houver). */
type LancamentoLido = {
  id: string; description: string; amount: number | string; payment_method: string | null
  is_paid: boolean; paid_at: string | null; created_at: string
  appointments: { procedures: { name: string } | null } | null
}

export default async function ClientFinancialPage() {
  const ctx = await getTenantContext()
  assertClient(ctx)

  const admin = createAdminClient()

  const data = await ler(admin
    .from('financial_transactions')
    .select(`
      id, description, amount, payment_method, is_paid, paid_at, created_at,
      appointments(procedures(name))
    `)
    // Pela ficha, não pelo agendamento: o pagamento de um plano não tem
    // agendamento, e ficava fora da lista do próprio cliente.
    .eq('client_id', ctx.clientId!)
    .eq('type', 'INCOME')
    .order('created_at', { ascending: false }), 'carregar os lançamentos do cliente')

  const rows: TxRow[] = ((data ?? []) as unknown as LancamentoLido[]).map(r => ({
    id:             r.id,
    description:    r.description,
    amount:         Number(r.amount),
    payment_method: r.payment_method,
    is_paid:        Boolean(r.is_paid),
    paid_at:        r.paid_at,
    created_at:     r.created_at,
    procedure_name: r.appointments?.procedures?.name ?? null,
  }))

  // O total é o LTV do cliente, do banco (pago, sem estorno) — a mesma conta
  // da ficha dele na clínica. Somar a lista aqui contava o estornado.
  const ficha = await ler(admin.from('clients').select('tenant_id').eq('id', ctx.clientId!).single(), 'buscar o cliente')
  if (!ficha) throw new Error('Cadastro do cliente não encontrado.')
  const total = (await getDoCliente(ficha.tenant_id as string, ctx.clientId!)).ltv

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
        <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 600, color: 'var(--text-muted)' }}>Total investido</p>
        <p style={{ fontSize: 'var(--text-name)', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.02em' }}>
          R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {rows.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 'var(--text-base-sz)', padding: '48px 0' }}>
          Nenhuma transação encontrada.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <div key={r.id} className="card" style={{ padding: '13px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--text-base-sz)', marginBottom: 2 }}>
                {r.procedure_name ?? r.description}
              </p>
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
                {r.paid_at
                  ? new Date(r.paid_at).toLocaleDateString('pt-BR')
                  : new Date(r.created_at).toLocaleDateString('pt-BR')}
                {r.payment_method && ` · ${METHOD_LABEL[r.payment_method] ?? r.payment_method}`}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <p style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>
                R$ {r.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <span style={{
                fontSize: 'var(--text-overline)',
                fontWeight: 700,
                color:      r.is_paid ? 'var(--success)' : 'var(--warning)',
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
