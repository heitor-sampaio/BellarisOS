import { getTenantContext, assertPermission, ownerFilter, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultFunnel, listAllStages } from '@/actions/crm-funnels'
import { funnelStats } from '@/lib/crm'
import { isUnitTag, unitTagName } from '@estetica-os/utils'
import { getCachedNetworkProcedures } from '@/lib/cached-queries'
import { CRMBoard } from '@/components/branch/crm-board'
import { CRMLeadModal } from '@/components/branch/crm-lead-modal'
import { CRMStageSettings } from '@/components/branch/crm-stage-settings'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { UserPlus } from 'lucide-react'

/** Nome da unidade marcada no lead, se houver. */
function unidadeDoLead(tags: unknown): string | null {
  const t = (Array.isArray(tags) ? tags : []).find(
    (x): x is string => typeof x === 'string' && isUnitTag(x),
  )
  return t ? unitTagName(t) : null
}

export default async function AdminOportunidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ funil?: string }>
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')

  const { funil: rawFunil } = await searchParams

  const admin = createAdminClient()

  // Filiais da rede
  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  const branches = (branchesRaw ?? []) as { id: string; name: string; slug: string }[]

  const canEdit = can(ctx, 'crm', 'MANAGE')

  // -- Funis e etapas --
  const funnels     = await seedDefaultFunnel(ctx.tenantId!)
  const ativos      = funnels.filter(f => f.archived_at === null)
  const selecionado = ativos.find(f => f.id === rawFunil)
    ?? ativos.find(f => f.is_default)
    ?? ativos[0]
    ?? funnels[0]

  const allStages = await listAllStages(ctx.tenantId!)
  const stages    = allStages.filter(s => s.funnel_id === selecionado?.id)
  const stageIds  = stages.map(s => s.id)

  const allProcs = await getCachedNetworkProcedures(ctx.tenantId!)

  const procedures = allProcs.map(p => ({ id: p.id as string, name: p.name as string }))

  // O lead é da REDE (`branch_id` nulo). Filtra pelas etapas do funil aberto —
  // funil sem etapa não tem o que buscar, e `.in()` com lista vazia vira
  // condição inválida no PostgREST.
  const leadOwner = ownerFilter(ctx, 'crm')
  let leadsRaw: Record<string, unknown>[] = []
  if (stageIds.length > 0) {
    let leadsQuery = admin
      .from('leads')
      .select(`
        id, name, phone, email, social_media, source,
        crm_stage_id, notes, client_id, created_at, tags,
        owner_id, users(name),
        conversations!leads_conversation_id_fkey(last_message_at, awaiting_since),
        lead_procedures(procedure_id, procedures(name, price))
      `)
      .eq('tenant_id', ctx.tenantId!)
      .in('crm_stage_id', stageIds)
    // Lead sem dono fica no bolo comum: aparece para todos até alguém assumir.
    if (leadOwner) leadsQuery = leadsQuery.or(`owner_id.is.null,owner_id.eq.${leadOwner}`)
    const { data, error } = await leadsQuery.order('created_at', { ascending: false })
    if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`)
    leadsRaw = data ?? []
  }

  const leads = leadsRaw.map((l: any) => {
    const { conversations, users: _dono, ...rest } = l
    // Uma conversa só: é o CONTATO dono da oportunidade (`leads.conversation_id`).
    // Antes isto era uma lista — as conversas que apontavam para o lead — e
    // deixou de servir quando a mesma pessoa passou a ter várias oportunidades:
    // só a principal ficava com `conversations.lead_id`, e as demais apareciam
    // sem atividade nenhuma no quadro.
    const conv = (conversations ?? null) as
      { last_message_at: string | null; awaiting_since: string | null } | null
    const lastInteractionAt = conv?.last_message_at ?? null
    const awaitingSince     = conv?.awaiting_since ?? null
    return {
      ...rest,
      tags:                l.tags ?? [],
      owner_name:          l.users?.name ?? null,
      last_interaction_at: lastInteractionAt,
      awaiting_since:      awaitingSince,
      // O badge da unidade sai da TAG, não de branch_id: o lead é da rede e a
      // coluna é sempre nula, então o badge nunca aparecia.
      branch_name:         unidadeDoLead(l.tags),
      branch_slug:         null,
    }
  })

  const stats = funnelStats(
    leads as unknown as { crm_stage_id: string | null; client_id: string | null }[],
    stages,
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['leads', 'crm_stages', 'crm_funnels']} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Oportunidades
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {stats.total} leads · {stats.ganhos} ganhos
            {stats.porResultado && ` · ${stats.perdidos} perdidos`}
            {' · '}{stats.conversao}% de conversão
            {stats.porResultado && ` · ${stats.clientes} viraram clientes`}
            {' · '}{branches.length} filial{branches.length !== 1 ? 'is' : ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && branches.length > 0 && (
            <>
              <CRMStageSettings
                slug="__admin__"
                funnels={funnels}
                stages={allStages}
                activeFunnelId={selecionado?.id ?? ''}
              />
              <CRMLeadModal
                branches={branches}
                unidades={branches}
                stages={allStages}
                funnels={ativos}
                funnelId={selecionado?.id ?? ''}
                initialStageId={stages[0]?.id}
                procedures={procedures}
                trigger={
                  <button type="button" className="btn-primary">
                    <UserPlus size={15} />
                    Novo lead
                  </button>
                }
              />
            </>
          )}
        </div>
      </div>

      {branches.length === 0 ? (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhuma filial ativa cadastrada.
          </p>
        </div>
      ) : (
        <>
          <CRMBoard
            initialLeads={leads}
            stages={stages}
            allStages={allStages}
            funnels={ativos}
            funnelId={selecionado?.id ?? ''}
            unidades={branches}
            procedures={procedures}
            branchId=""
            slug="__admin__"
            networkMode
            branches={branches}
          />
        </>
      )}
    </div>
  )
}
