import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ClipboardList, ChevronRight, User } from 'lucide-react'

export default async function CheckoutListPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  assertPermission(ctx, 'procedures', 'VIEW')

  const supabase = await createSupabase()
  const admin    = createAdminClient()

  const { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) notFound()

  const { data: plansRaw } = await admin
    .from('treatment_plans')
    .select(`
      id, status, professional_notes, created_at,
      clients(name, phone),
      treatment_plan_items(unit_price, sessions)
    `)
    .eq('branch_id', branch.id)
    .eq('status', 'PROPOSED')
    .order('created_at', { ascending: true })

  type RawClient = { name: string; phone: string | null }
  type RawItem   = { unit_price: number; sessions: number }

  const plans = (plansRaw ?? []).map(p => {
    const cli   = p.clients as unknown as RawClient | null
    const items = (p.treatment_plan_items as RawItem[]) ?? []
    const total = items.reduce((s, it) => s + Number(it.unit_price) * it.sessions, 0)
    return {
      id:      p.id as string,
      name:    cli?.name ?? '—',
      phone:   cli?.phone ?? null,
      total,
      notes:   (p.professional_notes as string | null) ?? null,
      waitingSince: p.created_at as string,
    }
  })

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Checkout de novos pacientes
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {branch.name} · {plans.length} aguardando
        </p>
      </div>

      {plans.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 24px', gap: 12,
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={24} style={{ color: 'var(--text-faint)' }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)' }}>Nenhum checkout pendente</p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center' }}>
            Quando uma profissional enviar um plano de tratamento para a recepção, ele aparecerá aqui.
          </p>
          <Link href={`/${slug}/agenda`} style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 700, textDecoration: 'none', marginTop: 4 }}>
            ← Voltar para agenda
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plans.map(plan => (
            <Link key={plan.id} href={`/${slug}/checkout/${plan.id}`} style={{ textDecoration: 'none' }}>
              <div
                className="card card-hover"
                style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', background: 'var(--brand-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <User size={20} style={{ color: 'var(--brand)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{plan.name}</p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {plan.phone ?? 'Sem telefone'} · aguardando {formatDistanceToNow(new Date(plan.waitingSince), { locale: ptBR, addSuffix: false })}
                  </p>
                  {plan.notes && (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{plan.notes}"
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                    {plan.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>Iniciar checkout</span>
                    <ChevronRight size={14} style={{ color: 'var(--brand)' }} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
