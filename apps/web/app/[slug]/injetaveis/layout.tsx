import { notFound } from 'next/navigation'
import { getTenantContext, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ListaDeInjetaveis } from '@/app/_shared/lista-de-injetaveis'
import { ler } from '@/lib/db'

export default async function BranchInjetaveisLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()

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

  return (
    <ListaDeInjetaveis branchId={branch.id} basePath={`/${slug}/injetaveis`}>
      {children}
    </ListaDeInjetaveis>
  )
}
