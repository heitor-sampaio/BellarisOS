import { getTenantContext, assertPermission, ownerFilter, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { filiaisAtivas } from '@/lib/branches'
import { getConversations } from '@/actions/inbox'
import { canaisConectados } from '@/lib/channels/factory'
import { isUnitTag, unitTagName } from '@estetica-os/utils'
import { CRMInbox } from '@/components/admin/crm-inbox'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { TravaRolagem } from '@/components/shared/trava-rolagem'

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

  const admin    = createAdminClient()
  const branches = await filiaisAtivas(ctx.tenantId!)

  // `convParam` entra aqui: a conversa vinda de um card do funil pode não ter
  // mensagem nenhuma, e sem isso ela não estaria na lista para ser aberta.
  const conversations = await getConversations(convParam)
  const canais = await canaisConectados(ctx.tenantId!, ctx.internalUserId)

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
    // Tela cheia, sem título nem contagem no topo: a caixa de entrada não é uma
    // página de conteúdo, é uma superfície de trabalho, como qualquer cliente de
    // mensagem. A contagem de não lidas não se perde — já está no menu lateral e
    // na própria lista de conversas.
    //
    // `.inbox-page` tira a tela do fluxo e a encaixa entre a topbar e o fim da
    // tela de verdade — medida em pixels reais, não em `vh`, que no celular
    // ignora a barra do navegador. `TravaRolagem` impede o documento de rolar
    // por trás: quem rola aqui é só a conversa.
    <div className="inbox-page" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TravaRolagem />
      <RealtimeRefresher tables={['leads', 'conversations']} />

      <CRMInbox
        telaCheia
        initialConversations={conversations}
        leads={inboxLeads}
        canEdit={can(ctx, 'crm', 'MANAGE')}
        branches={branches}
        initialSelectedId={convParam ?? null}
        canaisConectados={canais.canais}
        numerosDaRede={canais.numeros}
        numeroDoUsuario={canais.numeroDoUsuario}
      />
    </div>
  )
}
