import { notFound } from 'next/navigation'
import { getTenantContext, assertRole } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { seedDefaultStages } from '@/actions/crm-stages'
import { CRMBoard } from '@/components/branch/crm-board'
import { CRMLeadModal } from '@/components/branch/crm-lead-modal'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { CRMStageSettings } from '@/components/branch/crm-stage-settings'
import { UserPlus } from 'lucide-react'

export default async function BranchCRMPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  assertRole(ctx, ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST'])

  const supabase = await createSupabase()

  const { data: branch } = await supabase
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single()
  if (!branch) notFound()

  // Etapas da rede (seed automático no primeiro acesso)
  const stages = await seedDefaultStages(ctx.tenantId!)

  // Procedimentos disponíveis nesta filial
  const { data: allProcs } = await supabase
    .from('procedures')
    .select('id, name, procedure_branch_availability(branch_id)')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  const procedures = (allProcs ?? [])
    .filter(p => {
      const av = p.procedure_branch_availability as { branch_id: string }[] | null
      if (!av || av.length === 0) return true
      return av.some(a => a.branch_id === branch.id)
    })
    .map(p => ({ id: p.id, name: p.name }))

  // Leads com procedimentos de interesse
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      id, name, phone, email, social_media, source,
      crm_stage_id, notes, client_id, created_at,
      lead_procedures(procedure_id, procedures(name, price))
    `)
    .eq('branch_id', branch.id)
    .eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })

  const total       = leads?.length ?? 0
  const convertidos = leads?.filter(l => l.client_id).length ?? 0
  const conversion  = total > 0 ? Math.round((convertidos / total) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['leads', 'crm_stages']} />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            CRM
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {total} leads · {convertidos} convertidos · {conversion}% de conversão
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ctx.isNetworkAdmin && (
            <CRMStageSettings slug={slug} stages={stages} />
          )}
          <CRMLeadModal
            branchId={branch.id}
            slug={slug}
            stages={stages}
            procedures={procedures}
            trigger={
              <button type="button" className="btn-primary">
                <UserPlus size={15} />
                Novo lead
              </button>
            }
          />
        </div>
      </div>

      {/* Board */}
      <CRMBoard
        initialLeads={(leads ?? []) as unknown as import('@/components/branch/crm-board').Lead[]}
        stages={stages}
        procedures={procedures}
        branchId={branch.id}
        slug={slug}
      />
    </div>
  )
}
