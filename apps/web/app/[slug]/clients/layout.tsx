import { notFound } from 'next/navigation'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'
import { subDays } from 'date-fns'
import { getTenantContext, can, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClientsSidebar } from '@/components/branch/clients-sidebar'
import { ListaDetalhe } from '@/components/shared/lista-detalhe'
import { getCachedNetworkClients, getCachedUltimasVisitas } from '@/lib/cached-queries'
import { ler } from '@/lib/db'
import { aniversariantesDoMes } from '@/lib/clientes/aniversariantes'

export default async function ClientsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  // D11 da 7ª simulação: a trava LANÇADA aqui, no layout, sai antes do
  // streaming — fora do Suspense do loading.tsx — e a resposta era HTTP 500,
  // enquanto as outras telas sem o módulo respondem 200 com a tela "sem
  // acesso". Sem o módulo, o layout não lê nada e só deixa passar a página:
  // é a trava dela (assertPermission, como toda page.tsx) que diz "sem acesso".
  if (!can(ctx, 'clients', 'VIEW')) return <>{children}</>

  const branch = await ler(createAdminClient()
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()
  // A sessão só lê sinais (o Heitor, 19/11, "vai na 2"): a unidade se lê pelo
  // servidor, e a abrangência que a RLS conferia se confere aqui.
  if (!alcancaUnidade(ctx, branch.id as string)) notFound()

  // O portal da unidade vê TODAS as clientes da rede (CL3 do Bloco Tags,
  // 2026-11-14; H5: "A cliente é da clínica"): não existe tag de unidade para
  // recortar a lista, e a busca "fora da unidade" (A17 da 8ª) saiu com ela.
  const [rawClients, ultimasVisitas, aniversariantes] = await Promise.all([
    getCachedNetworkClients(ctx.tenantId!),
    getCachedUltimasVisitas(ctx.tenantId!, null),
    aniversariantesDoMes(ctx.tenantId!),
  ])

  // A última visita na REDE, agregada no banco.
  const lastVisitMap = new Map(ultimasVisitas.map(v => [v.client_id, v.ultima]))

  const thirtyDaysAgo = subDays(new Date(), 30)
  const clients = (rawClients ?? []).map(c => ({
    id:        c.id as string,
    name:      c.name as string,
    phone:     c.phone as string,
    tags:      (c.tags ?? []) as string[],
    isActive:  c.is_active as boolean,
    // F35: a importada com "cliente desde" de antes não é nova.
    isNew:     new Date((c as { cliente_desde?: string | null }).cliente_desde ?? c.created_at) >= thirtyDaysAgo,
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
          // A21 da 21ª: a importação é de quem é da rede (H8) — o atalho também.
          importarHref={can(ctx, 'clients', 'MANAGE') && mexeNaConfigDaRede(ctx) ? `/${slug}/settings?tab=importacoes` : null}
          clients={clients}
          basePath={`/${slug}/clients`}
          totalActive={totalActive}
          aniversariantes={aniversariantes}
          // A21 da 16ª: escolher várias e "Marcar tag" (Clientes em Gerenciar).
          marcarTag={can(ctx, 'clients', 'MANAGE') ? { slug } : null}
        />
      }
    >
      {children}
    </ListaDetalhe>
  )
}
