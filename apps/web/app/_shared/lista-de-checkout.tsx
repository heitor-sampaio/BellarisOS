import { getTenantContext, assertPodeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ClipboardList, ChevronRight, User } from 'lucide-react'

/**
 * Planos de tratamento aguardando checkout — a mesma lista nos dois portais.
 *
 * Sem nome de filial é a rede inteira: quem opera a rede vê o que está parado
 * em qualquer unidade sem entrar no portal de cada uma. Aí cada linha diz de
 * qual unidade é — a informação que some quando a lista deixa de ser de uma
 * filial só.
 */
export async function ListaDeCheckout({
  branchIds, branchName, slug,
}: {
  /**
   * Filiais que entram na lista — uma no portal da unidade, todas as ativas na
   * rede. `treatment_plans` não tem `tenant_id`: o recorte de rede é por
   * `branch_id`, e é quem chama que resolve quais.
   */
  branchIds:   string[]
  /** Nome no subtítulo; `null` = rede. */
  branchName:  string | null
  slug:        string
}) {
  const ctx = await getTenantContext()
  assertPodeReceber(ctx)

  const ehRede = branchName === null
  const admin  = createAdminClient()

  // O total vem das SESSÕES, que é o que o editor do plano grava. A consulta
  // antiga somava `treatment_plan_items`, tabela que nenhum código escreve desde
  // que o plano passou a ser por sessão: a fila mostrava R$ 0,00 em todo plano
  // real, e quem ia receber não sabia de quanto era a venda.
  const { data: plansRaw, error } = await admin
    .from('treatment_plans')
    .select(`
      id, status, professional_notes, created_at, branch_id,
      clients(name, phone),
      branches!branch_id(name),
      treatment_plan_sessions(treatment_plan_session_procedures(price))
    `)
    .in('branch_id', branchIds)
    .eq('status', 'PROPOSED')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Falha ao carregar os checkouts: ${error.message}`)

  type RawClient = { name: string; phone: string | null }
  type RawSess   = { treatment_plan_session_procedures: { price: number }[] }
  type RawBranch = { name: string }

  const plans = (plansRaw ?? []).map(p => {
    const cli      = p.clients  as unknown as RawClient | null
    const br       = p.branches as unknown as RawBranch | null
    const sessoes  = (p.treatment_plan_sessions as unknown as RawSess[]) ?? []
    const total    = sessoes.reduce(
      (s, sess) => s + (sess.treatment_plan_session_procedures ?? []).reduce((t, pr) => t + Number(pr.price), 0),
      0,
    )
    return {
      id:      p.id as string,
      name:    cli?.name ?? '—',
      phone:   cli?.phone ?? null,
      unidade: br?.name ?? null,
      total,
      notes:   (p.professional_notes as string | null) ?? null,
      waitingSince: p.created_at as string,
    }
  })

  // No portal da rede tudo resolve dentro de /admin; na unidade, dentro dela.
  const base = ehRede ? '/admin' : `/${slug}`

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Checkout de novos pacientes
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {branchName ?? 'Rede'} · {plans.length} aguardando
        </p>
      </div>

      {plans.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '60px 24px', gap: 12,
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-squircle)', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={24} style={{ color: 'var(--text-faint)' }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)' }}>Nenhum checkout pendente</p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center' }}>
            Quando uma profissional enviar um plano de tratamento para a recepção, ele aparecerá aqui.
          </p>
          <Link href={`${base}/agenda`} style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 700, textDecoration: 'none', marginTop: 4 }}>
            ← Voltar para agenda
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plans.map(plan => (
            <Link key={plan.id} href={`${base}/checkout/${plan.id}`} style={{ textDecoration: 'none' }}>
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
                    {ehRede && plan.unidade ? `${plan.unidade} · ` : ""}
                    {plan.phone ?? 'Sem telefone'} · aguardando {formatDistanceToNow(new Date(plan.waitingSince), { locale: ptBR, addSuffix: false })}
                  </p>
                  {plan.notes && (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      &quot;{plan.notes}&quot;
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
