import { getTenantContext, assertPermission, ownerFilter, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConversations } from '@/actions/inbox'
import { canaisConectados } from '@/lib/channels/factory'
import { isUnitTag, unitTagName } from '@estetica-os/utils'
import { CRMInbox } from '@/components/admin/crm-inbox'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'

/** Nome da unidade marcada no lead, se houver. */
function unidadeDoLead(tags: unknown): string | null {
  const t = (Array.isArray(tags) ? tags : []).find(
    (x): x is string => typeof x === 'string' && isUnitTag(x),
  )
  return t ? unitTagName(t) : null
}

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')

  // `?c=` é o deep-link do card de Oportunidades para a conversa.
  const { c: convParam } = await searchParams

  const admin = createAdminClient()

  const { data: branchesRaw } = await admin
    .from('branches')
    .select('id, name, slug')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .order('name')

  const branches = (branchesRaw ?? []) as { id: string; name: string; slug: string }[]

  const conversations = await getConversations()
  const canais = await canaisConectados(ctx.tenantId!)

  // Lista para o seletor de "nova conversa". Não passa por etapa nem funil: a
  // caixa de entrada é de contatos, não do funil.
  const leadOwner = ownerFilter(ctx, 'crm')
  let leadsQuery = admin
    .from('leads')
    .select('id, name, phone, tags')
    .eq('tenant_id', ctx.tenantId!)
  if (leadOwner) leadsQuery = leadsQuery.or(`owner_id.is.null,owner_id.eq.${leadOwner}`)
  const { data: leadsRaw, error } = await leadsQuery.order('created_at', { ascending: false })
  if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`)

  const inboxLeads = (leadsRaw ?? []).map(l => ({
    id:          l.id as string,
    name:        l.name as string,
    phone:       (l.phone as string | null) ?? null,
    branch_name: unidadeDoLead(l.tags),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <RealtimeRefresher tables={['leads', 'conversations']} />

      <div>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Inbox
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
          {' · '}
          {conversations.reduce((s, c) => s + c.unread_count, 0)} não lida
          {conversations.reduce((s, c) => s + c.unread_count, 0) !== 1 ? 's' : ''}
        </p>
      </div>

      <CRMInbox
        initialConversations={conversations}
        leads={inboxLeads}
        canEdit={can(ctx, 'crm', 'MANAGE')}
        branches={branches}
        initialSelectedId={convParam ?? null}
        canaisConectados={canais}
      />
    </div>
  )
}
