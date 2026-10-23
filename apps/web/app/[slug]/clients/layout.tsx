import { notFound } from 'next/navigation'
import { subDays } from 'date-fns'
import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { ClientsSidebar } from '@/components/branch/clients-sidebar'
import { ListaDetalhe } from '@/components/shared/lista-detalhe'
import { getCachedBranchClients, getCachedUltimasVisitas } from '@/lib/cached-queries'
import { ler } from '@/lib/db'

export default async function ClientsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'VIEW')

  const supabase = await createSupabase()
  const branch = await ler(supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()

  const [rawClients, ultimasVisitas] = await Promise.all([
    getCachedBranchClients(branch.id, ctx.tenantId!),
    getCachedUltimasVisitas(ctx.tenantId!, branch.id),
  ])

  // A última visita NESTA unidade, agregada no banco.
  const lastVisitMap = new Map(ultimasVisitas.map(v => [v.client_id, v.ultima]))

  const thirtyDaysAgo = subDays(new Date(), 30)
  const clients = (rawClients ?? []).map(c => ({
    id:        c.id as string,
    name:      c.name as string,
    phone:     c.phone as string,
    tags:      (c.tags ?? []) as string[],
    isActive:  c.is_active as boolean,
    isNew:     new Date(c.created_at) >= thirtyDaysAgo,
    lastVisit: lastVisitMap.get(c.id) ?? null,
  }))

  const totalActive = clients.filter(c => c.isActive).length

  return (
    <ListaDetalhe
      basePath={`/${slug}/clients`}
      lista={
        <ClientsSidebar
          // Com só "Ver", o botão "+ novo cliente" aparecia e a rota
          // /clients/new recusava. `null` esconde; `undefined` usa o padrão.
          newClientHref={can(ctx, 'clients', 'MANAGE') ? undefined : null}
          clients={clients}
          basePath={`/${slug}/clients`}
          totalActive={totalActive}
        />
      }
    >
      {children}
    </ListaDetalhe>
  )
}
