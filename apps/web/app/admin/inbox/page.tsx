import { getTenantContext, assertPermission, can, assertRecurso } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { unidadesAtivas } from '@/lib/branches'
import { getConversations, opcoesDoInbox } from '@/actions/inbox'
import { canaisConectados } from '@/lib/channels/factory'
import { CRMInbox } from '@/components/admin/crm-inbox'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { TravaRolagem } from '@/components/shared/trava-rolagem'
import { lerTodas } from '@/lib/db'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const ctx = await getTenantContext()
  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).
  assertRecurso(ctx, 'inbox')
  assertPermission(ctx, 'crm', 'VIEW')

  // `?c=` é o deep-link do card de Oportunidades para a conversa.
  const { c: convParam } = await searchParams

  const admin    = createAdminClient()
  const branches = await unidadesAtivas(ctx.tenantId!)

  // `convParam` entra aqui: a conversa vinda de um card do funil pode não ter
  // mensagem nenhuma, e sem isso ela não estaria na lista para ser aberta.
  const [pagina, opcoesDosFiltros] = await Promise.all([
    getConversations({ incluirId: convParam }),
    opcoesDoInbox(),
  ])
  const canais = await canaisConectados(ctx.tenantId!, ctx.internalUserId)

  // Lista para o seletor de "nova conversa". Não passa por etapa nem funil: a
  // caixa de entrada é de contatos, não do funil.
  // Todas, em páginas (2026-10-22): com o corte de 1000 do PostgREST, as
  // oportunidades mais antigas não podiam ser escolhidas.
  const leadsRaw = await lerTodas((de, ate) =>
    admin
      .from('leads')
      .select('id, name, phone')
      .eq('tenant_id', ctx.tenantId!)
      .order('created_at', { ascending: false }).order('id').range(de, ate),
  'carregar as oportunidades')

  const inboxLeads = (leadsRaw ?? []).map(l => ({
    id:          l.id as string,
    name:        l.name as string,
    phone:       (l.phone as string | null) ?? null,
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
      {/* A lista e a conversa aberta se recarregam sozinhas (o CRMInbox assina
          o tópico `inbox` e o sinal da conversa). A página relê as oportunidades,
          os funis, as etapas e as tags: só quando o quadro muda, não a cada
          mensagem da rede (19/11). */}
      <RealtimeRefresher tables={['crm_quadro_sinais']} />

      <CRMInbox
        telaCheia
        initialConversations={pagina.conversas}
        initialTemMais={pagina.temMais}
        initialCursor={pagina.cursor}
        opcoesDosFiltros={opcoesDosFiltros}
        leads={inboxLeads}
        canEdit={can(ctx, 'crm', 'MANAGE')}
        branches={branches}
        initialSelectedId={convParam ?? null}
        canaisConectados={canais.canais}
        podeConfigurarIntegracoes={can(ctx, 'settings', 'MANAGE') && mexeNaConfigDaRede(ctx)}
        numerosDaRede={canais.numeros}
        numeroDoUsuario={canais.numeroDoUsuario}
      />
    </div>
  )
}
