import { redirect } from 'next/navigation'
import { quantasUnidadesAtivas } from '@/lib/unidades/da-tela'
import { getTenantContext, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { AdminSidebar } from '@/components/admin/sidebar'
import { Topbar } from '@/components/shared/topbar'
import { avisoDaAssinatura } from '@/lib/redes/aviso'
import { SidebarProvider } from '@/components/shared/sidebar-context'
import { Suspense } from 'react'
import { Copilot } from '@/components/copilot/copilot'
import { CopilotForaDoPlano } from '@/components/copilot/copilot-fora-do-plano'
import { copilotNaTela, copilotForaDoPlanoNaTela, redeEmTeste } from '@/lib/copilot/disponivel'
import { comAviso } from '@/lib/aviso-da-url'
import { AvisoDaUrl } from '@/components/shared/aviso-da-url'
import { UmaUnidadeProvider } from '@/components/shared/uma-unidade'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'
import { FusoProvider } from '@/components/shared/fuso'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { saudacao } from '@/lib/saudacao'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext()

  // Portal da rede: apenas usuários de abrangência de rede (branch_id null) ou o admin.
  if (ctx.isClient) redirect('/auth/redirect') // a cliente volta à home dela (A43), não ao login
  // Quem tem unidade fixa vai à dela, com o aviso (J-29: voltava calado).
  if (ctx.branchId !== null && !ctx.isNetworkAdmin) {
    const unidade = await ler(createAdminClient().from('branches').select('slug')
      .eq('id', ctx.branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
    redirect(unidade?.slug ? comAviso(`/${unidade.slug}/dashboard`, 'portal-da-rede') : '/')
  }

  const admin = createAdminClient()

  const [tenant, unreadRes] = await Promise.all([
    // A rede É lida com `ler`: com o erro descartado, uma falha na consulta
    // parecia "onboarding não concluído" e mandava o admin para /setup.
    // A Admin da rede pelo cargo do BANCO (C58/C60, F70), não pela claim.
    (ctx.isNetworkAdmin && ctx.tenantId)
      ? ler(admin.from('tenants').select('onboarding_completed_at').eq('id', ctx.tenantId).maybeSingle(), 'carregar a rede')
      : Promise.resolve(null),
    ctx.internalUserId
      ? admin.from('user_notifications').select('id', { count: 'exact', head: true })
          .eq('user_id', ctx.internalUserId).eq('is_received', false)
      : Promise.resolve({ count: 0, error: null }),
  ])

  // O setup se dá por concluído quando a unidade existe (A1 da 9ª simulação):
  // criada a unidade, toda URL do /admin voltava ao "Tudo pronto!" até o
  // clique em "Acessar o painel" — quem fechava a aba no fim caía nele de
  // novo. Sem unidade ativa, o setup segue sendo o caminho.
  if (ctx.isNetworkAdmin && !tenant?.onboarding_completed_at) {
    if (!(await quantasUnidadesAtivas(ctx.tenantId!))) redirect('/setup')
  }

  // O contador do sino é acessório: falhar aqui não pode derrubar o portal
  // inteiro. A falha fica no log e o sino começa em zero (o realtime corrige).
  if (unreadRes.error) console.error('[admin/layout] contar as notificações:', unreadRes.error.message)
  const initialUnread = unreadRes.count ?? 0
  // A clínica de uma unidade não fala "rede" (D-19, F8): a régua vai às telas do navegador.
  const umaUnidade = ctx.tenantId ? await redeTemUmaUnidade(ctx.tenantId) : false

  // As datas e horas da tela no fuso da rede (F62): o das unidades, se é um só.
  const fuso = await fusoDaRede(ctx.tenantId)

  return (
    <UmaUnidadeProvider valor={umaUnidade}>
    <FusoProvider fuso={fuso}>
    <SidebarProvider>
      <Suspense fallback={null}><AvisoDaUrl /></Suspense>
      <AdminSidebar permissions={ctx.permissions} scopes={ctx.scopes} plano={ctx.plano ?? null} />
      <Topbar userName={ctx.userName || 'Usuário'} userRole={ctx.role} roleLabel={ctx.roleLabel} internalUserId={ctx.internalUserId} initialUnread={initialUnread} slug={null} permissions={ctx.permissions} scopes={ctx.scopes} plano={ctx.plano ?? null} agendaPropria={isOwnScope(ctx, 'agenda')} suporte={ctx.suporte ?? null} assinatura={await avisoDaAssinatura(ctx)} saudacaoInicial={saudacao(new Date(), fuso)} />
      <main style={{
        marginLeft:    'var(--sidebar-w)',
        marginTop:     'calc(var(--topbar-h) + env(safe-area-inset-top, 0px))',
        padding:       'var(--content-pad-y) var(--content-pad-x)',
        paddingBottom: 'calc(var(--content-pad-y) + env(safe-area-inset-bottom, 0px))',
        minHeight:     'calc(100vh - var(--topbar-h))',
        transition:    'margin-left var(--sidebar-anim) var(--sidebar-ease)',
        overflowX:     'clip',
        minWidth:      0,
      }}>
        {children}
      </main>
      {/* A secretária virtual, por cima de todas as telas da equipe (docs/regras/copilot.md). */}
      {copilotNaTela(ctx) && <Suspense fallback={null}><Copilot /></Suspense>}
      {/* Fora do plano, explicado a quem administra a clínica (A51). */}
      {!copilotNaTela(ctx) && copilotForaDoPlanoNaTela(ctx) && (
        <CopilotForaDoPlano emTeste={await redeEmTeste(ctx.tenantId!)} assinaturaHref="/admin/settings?tab=assinatura" />
      )}
    </SidebarProvider>
    </FusoProvider>
    </UmaUnidadeProvider>
  )
}
