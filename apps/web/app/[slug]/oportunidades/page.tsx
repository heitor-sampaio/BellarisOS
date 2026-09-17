import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission, ownerFilter, can } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { seedDefaultFunnel, listAllStages } from '@/actions/crm-funnels'
import { funnelStats } from '@/lib/crm'
import { CRMBoard } from '@/components/branch/crm-board'
import { CRMLeadModal } from '@/components/branch/crm-lead-modal'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { CRMStageSettings } from '@/components/branch/crm-stage-settings'
import { UserPlus } from 'lucide-react'

export default async function BranchOportunidadesPage({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ funil?: string }>
}) {
  const { slug }        = await params
  const { funil: rawFunil } = await searchParams
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')

  const supabase = await createSupabase()

  const { data: branch } = await supabase
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single()
  if (!branch) notFound()

  // Funis da rede (seed automático no primeiro acesso) e o funil aberto.
  const funnels      = await seedDefaultFunnel(ctx.tenantId!)
  const ativos       = funnels.filter(f => f.archived_at === null)
  const selecionado  = ativos.find(f => f.id === rawFunil)
    ?? ativos.find(f => f.is_default)
    ?? ativos[0]
    ?? funnels[0]

  // Todas as etapas: as do funil aberto viram colunas, o resto alimenta o
  // seletor que move o lead para outro funil.
  const allStages = await listAllStages(ctx.tenantId!)
  const stages    = allStages.filter(s => s.funnel_id === selecionado?.id)
  const stageIds  = stages.map(s => s.id)

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

  // Unidades da rede — alimentam as sugestões de tag do modal.
  const { data: todasAsUnidades, error: erroUnidades } = await supabase
    .from('branches')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')
  if (erroUnidades) throw new Error(`Falha ao carregar as unidades: ${erroUnidades.message}`)

  const unidades = (todasAsUnidades ?? []).map(b => ({ id: b.id as string, name: b.name as string }))

  // Leads do funil aberto.
  //
  // ⚠️ Sem recorte por unidade — o lead é da REDE. Isto aqui já filtrou por
  // `.eq('branch_id', branch.id)`, e como nenhum lead tem filial o quadro da
  // unidade nunca mostrou um lead sequer. Depois filtrou por tag de unidade,
  // escondendo o que estava marcado para outra — o que é decidir distribuição
  // no código. Quem decide de quem é o lead são as pessoas (tag e dono) e, no
  // futuro, as automações; a tela só oferece os filtros.
  //
  // `ownerFilter` continua valendo: é o alcance do CARGO ("só os próprios
  // leads"), coisa diferente de recorte por unidade. Funil sem etapa nenhuma
  // não tem o que buscar — `.in()` com lista vazia é inválido no PostgREST.
  const leadOwner = ownerFilter(ctx, 'crm')
  let leads: Record<string, unknown>[] = []
  if (stageIds.length > 0) {
    let leadsQuery = supabase
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
    // Lead que chega sozinho pelo WhatsApp nasce sem dono: some para todo cargo
    // com alcance próprio se o filtro for só `owner_id = eu`. Sem dono é bolo
    // comum — aparece para todos até alguém assumir.
    if (leadOwner) leadsQuery = leadsQuery.or(`owner_id.is.null,owner_id.eq.${leadOwner}`)
    const { data, error } = await leadsQuery.order('created_at', { ascending: false })
    if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`)
    leads = data ?? []
  }

  const stats = funnelStats(
    leads as unknown as { crm_stage_id: string | null; client_id: string | null }[],
    stages,
  )

  // Métricas de atendimento derivadas das conversas de cada lead.
  const leadsData = leads.map((l: any) => {
    const { conversations, users: _dono, ...rest } = l
    // Uma conversa só: é o CONTATO dono da oportunidade (`leads.conversation_id`).
    // Antes era a lista das conversas que apontavam para o lead, o que deixou de
    // servir quando a mesma pessoa passou a ter várias oportunidades.
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
    }
  })

  // Configurar funis é permissão de CRM, não cargo de rede: uma gerente com
  // `crm: MANAGE` monta o funil da unidade dela.
  const podeConfigurar = can(ctx, 'crm', 'MANAGE')

  return (
    <div className="crm-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['leads', 'crm_stages', 'crm_funnels']} />
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Oportunidades
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {stats.total} leads · {stats.ganhos} ganhos
            {stats.porResultado && ` · ${stats.perdidos} perdidos`}
            {' · '}{stats.conversao}% de conversão
            {stats.porResultado && ` · ${stats.clientes} viraram clientes`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {podeConfigurar && (
            <CRMStageSettings
              slug={slug}
              funnels={funnels}
              stages={allStages}
              activeFunnelId={selecionado?.id ?? ''}
            />
          )}
          <CRMLeadModal
            branchId={branch.id}
            slug={slug}
            branchName={branch.name}
            unidades={unidades}
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
        </div>
      </div>


      {/* Board */}
      <CRMBoard
        initialLeads={leadsData as unknown as import('@/components/branch/crm-board').Lead[]}
        stages={stages}
        allStages={allStages}
        funnels={ativos}
        funnelId={selecionado?.id ?? ''}
        unidades={unidades}
        procedures={procedures}
        branchId={branch.id}
        slug={slug}
      />
    </div>
  )
}
