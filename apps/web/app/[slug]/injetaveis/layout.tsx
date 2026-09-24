import { notFound } from 'next/navigation'
import { getTenantContext } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
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

  const supabase = await createSupabase()
  const branch = await ler(supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()

  return (
    <ListaDeInjetaveis branchId={branch.id} basePath={`/${slug}/injetaveis`}>
      {children}
    </ListaDeInjetaveis>
  )
}
