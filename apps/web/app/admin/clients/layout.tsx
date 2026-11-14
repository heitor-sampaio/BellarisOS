import { subDays } from 'date-fns'
import { getTenantContext, can } from '@/lib/auth'
import { ClientsSidebar } from '@/components/branch/clients-sidebar'
import { ListaDetalhe } from '@/components/shared/lista-detalhe'
import { getCachedNetworkClients, getCachedUltimasVisitas } from '@/lib/cached-queries'
import { getClientesAtivos } from '@/lib/metrics/unidade'
import { aniversariantesDoMes } from '@/lib/clientes/aniversariantes'

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

  const [rawClients, ultimasVisitas, aniversariantes, ativos] = await Promise.all([
    getCachedNetworkClients(ctx.tenantId!),
    getCachedUltimasVisitas(ctx.tenantId!, null),
    aniversariantesDoMes(ctx.tenantId!),
    // O contador vem do banco (A24). A cliente é da rede (CL2 do Bloco Tags):
    // não há contador por unidade.
    getClientesAtivos({ tenantId: ctx.tenantId! }),
  ])

  const lastVisitMap = new Map(ultimasVisitas.map(v => [v.client_id, v.ultima]))

  const thirtyDaysAgo = subDays(new Date(), 30)

  // A cliente é da REDE (CL1 do Bloco Tags, 2026-11-14): a linha não diz unidade.
  const clients = (rawClients ?? []).map(c => ({
    id:         c.id as string,
    name:       c.name as string,
    phone:      c.phone as string,
    tags:       (c.tags ?? []) as string[],
    isActive:   c.is_active as boolean,
    // F35: a importada com "cliente desde" de antes não é nova.
    isNew:      new Date((c as { cliente_desde?: string | null }).cliente_desde ?? c.created_at) >= thirtyDaysAgo,
    lastVisit:  lastVisitMap.get(c.id) ?? null,
  }))

  return (
    <ListaDetalhe
      basePath="/admin/clients"
      lista={
        <ClientsSidebar
          clients={clients}
          basePath="/admin/clients"
          totalActive={ativos.total}
          // A rede passa a cadastrar pela própria rede: antes o botão era
          // escondido aqui e só existia dentro do portal de uma unidade.
          newClientHref={can(ctx, 'clients', 'MANAGE') ? undefined : null}
          aniversariantes={aniversariantes}
        />
      }
    >
      {children}
    </ListaDetalhe>
  )
}
