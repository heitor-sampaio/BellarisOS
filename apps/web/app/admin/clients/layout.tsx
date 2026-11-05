import { subDays } from 'date-fns'
import { getTenantContext, can } from '@/lib/auth'
import { ClientsSidebar } from '@/components/branch/clients-sidebar'
import { ListaDetalhe } from '@/components/shared/lista-detalhe'
import { getCachedNetworkClients, getCachedUltimasVisitas, getCachedNetworkBranches } from '@/lib/cached-queries'
import { getClientesAtivos } from '@/lib/metrics/unidade'

export default async function AdminClientsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getTenantContext()
  // D11 da 7ª simulação: a trava LANÇADA aqui, no layout, sai antes do
  // streaming — fora do Suspense do loading.tsx — e a resposta era HTTP 500,
  // enquanto as outras telas sem o módulo respondem 200 com a tela "sem
  // acesso". Sem o módulo, o layout não lê nada e só deixa passar a página:
  // é a trava dela (assertPermission, como toda page.tsx) que diz "sem acesso".
  if (!can(ctx, 'clients', 'VIEW')) return <>{children}</>

  const [rawClients, ultimasVisitas, branchesRaw] = await Promise.all([
    getCachedNetworkClients(ctx.tenantId!),
    getCachedUltimasVisitas(ctx.tenantId!, null),
    getCachedNetworkBranches(ctx.tenantId!),
  ])

  const lastVisitMap = new Map(ultimasVisitas.map(v => [v.client_id, v.ultima]))

  const thirtyDaysAgo = subDays(new Date(), 30)

  const clients = (rawClients ?? []).map(c => {
    const branch = Array.isArray(c.branches) ? (c.branches[0] as { id: string; name: string } | undefined) ?? null : (c.branches as { id: string; name: string } | null)
    return {
      id:         c.id as string,
      name:       c.name as string,
      phone:      c.phone as string,
      tags:       (c.tags ?? []) as string[],
      isActive:   c.is_active as boolean,
      isNew:      new Date(c.created_at) >= thirtyDaysAgo,
      lastVisit:  lastVisitMap.get(c.id) ?? null,
      branchId:   (c.branch_id ?? undefined) as string | undefined,
      branchName: branch?.name ?? undefined,
    }
  })

  const branches       = (branchesRaw ?? []) as { id: string; name: string; slug: string }[]
  // O contador vem do banco (A24): o da rede e o de cada unidade, para
  // acompanhar o recorte do `?unidade=`.
  const ativos         = await getClientesAtivos({ tenantId: ctx.tenantId!, unidades: branches })
  const totalActive    = ativos.total

  return (
    <ListaDetalhe
      basePath="/admin/clients"
      lista={
        <ClientsSidebar
          clients={clients}
          basePath="/admin/clients"
          totalActive={totalActive}
          ativosPorUnidade={ativos.porUnidade}
          // A rede passa a cadastrar pela própria rede: antes o botão era
          // escondido aqui e só existia dentro do portal de uma unidade.
          newClientHref={can(ctx, 'clients', 'MANAGE') ? undefined : null}
          availableBranches={branches}
          // A abrangência vence o `?unidade=` (J-54): quem tem unidade fixa fica nela.
          unidadeFixa={ctx.branchId}
        />
      }
    >
      {children}
    </ListaDetalhe>
  )
}
