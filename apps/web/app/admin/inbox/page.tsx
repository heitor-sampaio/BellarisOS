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
    // Tela cheia, sem título nem contagem no topo.
    //
    // As margens negativas cancelam o padding do <main> do layout: ele vale para
    // página de conteúdo, e a caixa de entrada não é uma — é uma superfície de
    // trabalho, como qualquer cliente de mensagem. A contagem de não lidas não
    // se perde: já está no menu lateral e na própria lista de conversas.
    <div style={{
      margin: 'calc(var(--content-pad-y) * -1) calc(var(--content-pad-x) * -1)',
      marginBottom: 'calc((var(--content-pad-y) + env(safe-area-inset-bottom, 0px)) * -1)',
      height: 'calc(100vh - var(--topbar-h))',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <RealtimeRefresher tables={['leads', 'conversations']} />

      <CRMInbox
        telaCheia
        initialConversations={conversations}
        leads={inboxLeads}
        canEdit={can(ctx, 'crm', 'MANAGE')}
        branches={branches}
        initialSelectedId={convParam ?? null}
        canaisConectados={canais.canais}
        provedorWhatsApp={canais.provedorWhatsApp}
      />
    </div>
  )
}
