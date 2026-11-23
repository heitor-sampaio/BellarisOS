import { notFound } from 'next/navigation'
import { unidadesParaCriar } from '@/lib/unidades/da-tela'
import { getTenantContext, assertPermission, can, assertRecurso, alcancaUnidade } from '@/lib/auth'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'
import { createAdminClient } from '@/lib/supabase/admin'
import { getConversations, opcoesDoInbox } from '@/actions/inbox'
import { canaisConectados } from '@/lib/channels/factory'
import { CRMInbox } from '@/components/admin/crm-inbox'
import { RealtimeRefresher } from '@/components/shared/realtime-refresher'
import { TravaRolagem } from '@/components/shared/trava-rolagem'
import { ler, lerTodas } from '@/lib/db'

export default async function BranchInboxPage({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ c?: string }>
}) {
  const { slug } = await params
  const { c: convParam } = await searchParams

  const ctx = await getTenantContext()

  // A funcionalidade é do PLANO da rede (lib/planos/recursos.ts).

  assertRecurso(ctx, 'inbox')
  assertPermission(ctx, 'crm', 'VIEW')

  const branch = await ler(createAdminClient()
    .from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).single(), 'buscar a unidade')
  if (!branch) notFound()
  // A sessão só lê sinais (o Heitor, 19/11, "vai na 2"): a unidade se lê pelo
  // servidor, e a abrangência que a RLS conferia se confere aqui.
  if (!alcancaUnidade(ctx, branch.id as string)) notFound()

  // ⚠️ Sem recorte por unidade, igual ao quadro de Oportunidades: lead e
  // conversa são da REDE. Quem responde na unidade vê as mesmas conversas de
  // quem responde na rede — o que separa são as caixas do cargo (aplicadas
  // dentro de `getConversations`), não a unidade.
  // `convParam` é o deep-link do card de Oportunidades: a conversa apontada pelo
  // card pode não ter mensagem nenhuma e, sem essa exceção, não estaria na lista.
  const [pagina, opcoesDosFiltros] = await Promise.all([
    getConversations({ incluirId: convParam }),
    opcoesDoInbox(),
  ])
  const canais = await canaisConectados(ctx.tenantId!, ctx.internalUserId)

  const admin = createAdminClient()

  // A unidade do contato e do agendar pelo inbox: as ATIVAS (lib/unidades/da-tela).
  const branches = await unidadesParaCriar(ctx.tenantId!)

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
    // Tela cheia, sem título nem contagem no topo — mesmo tratamento de
    // /admin/inbox: a caixa de entrada é superfície de trabalho, não página de
    // conteúdo. `.inbox-page` encaixa a tela entre a topbar e o fim real da
    // viewport (pixels, não `vh`), e `TravaRolagem` impede o documento de rolar
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
        slug={slug}
        initialSelectedId={convParam ?? null}
        canaisConectados={canais.canais}
        // A integração é da clínica toda: a gerente de unidade fixa pede a quem administra (H7).
        podeConfigurarIntegracoes={can(ctx, 'settings', 'MANAGE') && mexeNaConfigDaRede(ctx)}
        numerosDaRede={canais.numeros}
        numeroDoUsuario={canais.numeroDoUsuario}
      />
    </div>
  )
}
