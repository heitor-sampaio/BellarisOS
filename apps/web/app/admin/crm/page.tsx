import Link from 'next/link'
import { getTenantContext, assertPermission, ownerFilter, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedDefaultFunnel, listAllStages } from '@/actions/crm-funnels'
import { funnelStats } from '@/lib/crm'
import { isUnitTag, unitTagName } from '@estetica-os/utils'
import { mesclarParams } from '@/lib/query-params'
import { getConversations } from '@/actions/inbox'
import { getCachedNetworkProcedures } from '@/lib/cached-queries'
import { CRMBoard } from '@/components/branch/crm-board'
import { CRMLeadModal } from '@/components/branch/crm-lead-modal'
import { CRMStageSettings } from '@/components/branch/crm-stage-settings'
import { FunnelSelect } from '@/components/shared/funnel-select'
import { CRMInbox } from '@/components/admin/crm-inbox'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { UserPlus } from 'lucide-react'

/** Nome da unidade marcada no lead, se houver. */
function unidadeDoLead(tags: unknown): string | null {
  const t = (Array.isArray(tags) ? tags : []).find(
    (x): x is string => typeof x === 'string' && isUnitTag(x),
  )
  return t ? unitTagName(t) : null
}

type View = 'funil' | 'inbox'

export default async function AdminCRMPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; c?: string; funil?: string }>
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')

  const { view: viewParam, c: convParam, funil: rawFunil } = await searchParams
  // Uma conversa selecionada (?c=) força a aba inbox (deep-link vindo do card do funil).
  const view: View = (viewParam === 'inbox' || convParam) ? 'inbox' : 'funil'

  const paramsAtuais = new URLSearchParams(
    Object.entries({ view: viewParam, c: convParam, funil: rawFunil })
      .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''),
  )

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

  // Funil da REDE: inclui leads de rede (branch_id null) + leads de filiais do tenant.
  // Filtra pelas etapas do funil aberto — funil sem etapa não tem o que buscar,
  // e `.in()` com lista vazia vira condição inválida no PostgREST.
  const leadOwner = ownerFilter(ctx, 'crm')
  let leadsRaw: Record<string, unknown>[] = []
  if (stageIds.length > 0) {
    let leadsQuery = admin
      .from('leads')
      .select(`
        id, name, phone, email, social_media, source,
        crm_stage_id, notes, client_id, created_at, tags,
        owner_id, users(name),
        conversations(last_message_at, awaiting_since),
        lead_procedures(procedure_id, procedures(name, price))
      `)
      .eq('tenant_id', ctx.tenantId!)
      .in('crm_stage_id', stageIds)
    // Ver o comentário em app/[slug]/crm/page.tsx: lead sem dono fica no bolo comum.
    if (leadOwner) leadsQuery = leadsQuery.or(`owner_id.is.null,owner_id.eq.${leadOwner}`)
    const { data, error } = await leadsQuery.order('created_at', { ascending: false })
    if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`)
    leadsRaw = data ?? []
  }

  const leads = leadsRaw.map((l: any) => {
    const { conversations, users: _dono, ...rest } = l
    const convs = (conversations ?? []) as { last_message_at: string | null; awaiting_since: string | null }[]
    const lastInteractionAt = convs
      .map(c => c.last_message_at)
      .filter((v): v is string => v != null)
      .sort()
      .at(-1) ?? null
    const awaitingSince = convs
      .map(c => c.awaiting_since)
      .filter((v): v is string => v != null)
      .sort()
      .at(0) ?? null
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

  // -- Inbox data (only when on inbox view) --
  const conversations = view === 'inbox' ? await getConversations() : []
  const totalUnread   = conversations.reduce((sum, c) => sum + c.unread_count, 0)

  // Leads list for new conversation picker (id + name + branch_name)
  const inboxLeads = leads.map((l: any) => ({
    id:          l.id as string,
    name:        l.name as string,
    phone:       l.phone ?? null,
    branch_name: l.branch_name ?? null,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['leads', 'crm_stages', 'crm_funnels']} />

      {/* -- Header -- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            CRM
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
          {view === 'funil' && canEdit && branches.length > 0 && (
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

      {/* -- Tabs --
          As duas abas preservam o funil aberto: montar a URL do zero aqui
          apagaria o ?funil= e jogaria de volta para o padrão ao voltar. */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--hairline)', marginBottom: -8 }}>
        <TabLink
          href={`/admin/crm${mesclarParams(paramsAtuais, { view: 'funil', c: null })}`}
          active={view === 'funil'}
        >
          Funil
        </TabLink>
        <TabLink
          href={`/admin/crm${mesclarParams(paramsAtuais, { view: 'inbox' })}`}
          active={view === 'inbox'}
        >
          Inbox
          {totalUnread > 0 && (
            <span style={{
              marginLeft: 6, background: 'var(--brand)', color: '#fff',
              borderRadius: 99, fontSize: 10, fontWeight: 800,
              padding: '1px 6px', display: 'inline-block',
            }}>
              {totalUnread}
            </span>
          )}
        </TabLink>
      </div>

      {/* -- Content -- */}
      {branches.length === 0 ? (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
            Nenhuma filial ativa cadastrada.
          </p>
        </div>
      ) : view === 'inbox' ? (
        <CRMInbox
          initialConversations={conversations}
          leads={inboxLeads}
          canEdit={canEdit}
          branches={branches}
          initialSelectedId={convParam ?? null}
        />
      ) : (
        <>
          <FunnelSelect funnels={ativos} activeId={selecionado?.id ?? ''} />
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

function TabLink({
  href, active, children,
}: {
  href: string; active: boolean; children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '8px 16px', fontSize: 13.5, fontWeight: active ? 800 : 600,
        color: active ? 'var(--brand)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
        textDecoration: 'none', transition: 'color 0.15s',
        marginBottom: -1,
      }}
    >
      {children}
    </Link>
  )
}
