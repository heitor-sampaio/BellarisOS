import { notFound } from 'next/navigation'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { DocumentosEmitidos, type ParamsDosDocumentos } from '@/app/_shared/documentos-emitidos'

/** Os termos e contratos da unidade. */
export default async function BranchDocumentosPage({
  params, searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<ParamsDosDocumentos>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  // A página confere por si (§6): o layout de [slug] deixa o cliente final passar.
  assertPermission(ctx, 'documents', 'VIEW')
  const unidade = await ler(createAdminClient().from('branches').select('id, name, slug')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade') as { id: string; name: string; slug: string } | null
  if (!unidade) notFound()
  return <DocumentosEmitidos unidade={unidade} params={await searchParams} />
}
