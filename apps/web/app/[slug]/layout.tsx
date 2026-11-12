import { redirect, notFound } from 'next/navigation'
import { getTenantContext, isOwnScope, caminhoDaRequisicao } from '@/lib/auth'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'
import { UmaUnidadeProvider } from '@/components/shared/uma-unidade'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BranchSidebar } from '@/components/branch/sidebar'
import { Topbar } from '@/components/shared/topbar'
import { avisoDaAssinatura } from '@/lib/redes/aviso'
import { SidebarProvider } from '@/components/shared/sidebar-context'
import { Suspense } from 'react'
import { Copilot } from '@/components/copilot/copilot'
import { CopilotForaDoPlano } from '@/components/copilot/copilot-fora-do-plano'
import { copilotNaTela, copilotForaDoPlanoNaTela, redeEmTeste } from '@/lib/copilot/disponivel'
import { getCachedBranchBySlug } from '@/lib/cached-queries'
import { ler } from '@/lib/db'
import { ENDERECOS_RESERVADOS } from '@/lib/unidades/endereco'
import { comAviso } from '@/lib/aviso-da-url'
import { AvisoDaUrl } from '@/components/shared/aviso-da-url'
import { saudacao } from '@/lib/saudacao'
import { FusoProvider } from '@/components/shared/fuso'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'

export default async function BranchLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // Endereço reservado não é unidade: `/api/rota-velha` cai no [...rota] como
  // "unidade api". Sem isto o layout pedia a sessão — que o proxy não exige em
  // /api/* — e o 404 virava 500 (a completa de 2026-10-28).
  if (ENDERECOS_RESERVADOS.includes(slug)) notFound()
  const ctx = await getTenantContext()

  // Portal do cliente: valida o vínculo com a CLÍNICA e devolve children sem
  // chrome de staff. A ficha é da clínica, não da unidade de cadastro (H5,
  // 2026-11-02: "A cliente é da clínica, pode agendar em qualquer unidade da
  // clínica"): o portal de QUALQUER unidade ativa da rede da ficha abre. Até
  // aqui só a de cadastro abria, e a Zona Sul voltava à Moinhos sem aviso (A62).
  if (ctx.isClient) {
    const adminClient = createAdminClient()
    const clientData = await ler(adminClient
      .from('clients')
      .select('tenant_id, branch_id')
      .eq('id', ctx.clientId!)
      .maybeSingle(), 'buscar o cliente')
    const unidade = clientData
      ? await ler(adminClient.from('branches').select('id, is_active')
          .eq('slug', slug).eq('tenant_id', clientData.tenant_id as string)
          .maybeSingle(), 'buscar a unidade')
      : null
    // A unidade de CADASTRO abre mesmo desativada (é o destino do login dela;
    // recusá-la seria um laço login → portal → login).
    if (!unidade || (!unidade.is_active && unidade.id !== clientData!.branch_id)) redirect('/login')
    // Tela da equipe aberta pela cliente (um link, o histórico): o portal dela,
    // não a tela de "sem acesso" — que fala de cargo e de rede (2026-10-21).
    const caminho = (await caminhoDaRequisicao()).split(' ')[1]?.split('?')[0] ?? ''
    if (caminho.startsWith(`/${slug}/`) && !caminho.startsWith(`/${slug}/cliente`)) redirect(`/${slug}/cliente`)
    // O app da cliente no fuso da unidade do endereço (F62).
    return <FusoProvider fuso={await fusoDaUnidade(clientData!.tenant_id as string, unidade.id as string)}>{children}</FusoProvider>
  }

  // Usuário operacional (não-cliente). O acesso a cada módulo é gateado por
  // assertPermission nas páginas; aqui só validamos vínculo com a filial (abaixo).
  const supabase = await createClient()

  const branch = await getCachedBranchBySlug(slug, ctx.tenantId!)

  if (!branch) notFound()

  // Usuário de filial só pode acessar a própria filial
  if (ctx.branchId && ctx.branchId !== branch.id) {
    // A unidade DO MEMBRO pelo servidor, não pela sessão (D9 da 9ª simulação):
    // mudada a unidade com a sessão aberta, o token ainda tem a claim velha, a
    // RLS escondia a unidade nova e o `.single()` lançava — 500 em toda tela.
    const userBranch = await ler(createAdminClient()
      .from('branches')
      .select('slug')
      .eq('id', ctx.branchId)
      .eq('tenant_id', ctx.tenantId!)
      .maybeSingle(), 'buscar a unidade')
    // Com o aviso (J-29): sem ele, o link "quebrado" voltava calado ao dashboard.
    redirect(comAviso(`/${userBranch?.slug ?? ''}/dashboard`, 'outra-unidade'))
  }

  // As unidades para trocar (quem é da REDE, a abrangência — C60, F70: era o
  // nome do cargo, e a sócia da rede com outro cargo não trocava de unidade)
  // + não-lidas em paralelo. Nome e permissões já vêm no ctx.
  const daRede = ctx.branchId === null
  const [allBranches, unreadRes] = await Promise.all([
    daRede
      ? ler(supabase
          .from('branches')
          .select('name, slug')
          .eq('tenant_id', ctx.tenantId!)
          .eq('is_active', true)
          .order('name'), 'carregar as unidades da rede').then(d => d ?? [])
      : Promise.resolve([]),
    ctx.internalUserId
      ? createAdminClient()
          .from('user_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', ctx.internalUserId)
          .eq('is_received', false)
      : Promise.resolve({ count: 0, error: null }),
  ])

  const permissions   = ctx.permissions
  // O contador do sino é acessório: a falha fica no log e ele começa em zero.
  if (unreadRes.error) console.error('[slug/layout] contar as notificações:', unreadRes.error.message)
  const initialUnread = unreadRes.count ?? 0
  // A clínica de uma unidade não fala "rede" (D-19, F8): a régua vai às telas do navegador.
  const umaUnidade = ctx.tenantId ? await redeTemUmaUnidade(ctx.tenantId) : true

  // As datas e horas da tela no fuso da unidade (F62).
  const fuso = await fusoDaUnidade(ctx.tenantId, branch.id)

  return (
    <UmaUnidadeProvider valor={umaUnidade}>
    <FusoProvider fuso={fuso}>
    <SidebarProvider>
      <Suspense fallback={null}><AvisoDaUrl /></Suspense>
      <BranchSidebar
        slug={branch.slug}
        branchName={branch.name}
        permissions={permissions}
        scopes={ctx.scopes}
        plano={ctx.plano ?? null}
        isNetworkAdmin={daRede}
        allBranches={allBranches}
        umaUnidade={umaUnidade}
      />
      <Topbar userName={ctx.userName || 'Usuário'} userRole={ctx.role} roleLabel={ctx.roleLabel} internalUserId={ctx.internalUserId} initialUnread={initialUnread} slug={branch.slug} permissions={permissions} scopes={ctx.scopes} plano={ctx.plano ?? null} agendaPropria={isOwnScope(ctx, 'agenda')} daRede={ctx.branchId === null} suporte={ctx.suporte ?? null} assinatura={await avisoDaAssinatura(ctx)} saudacaoInicial={saudacao(new Date(), fuso)} />
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
