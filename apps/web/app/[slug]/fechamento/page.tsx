import { notFound } from 'next/navigation'
import { getTenantContext, podeReceber, can, alcancaUnidade } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { FechamentoDoDia } from '@/app/_shared/fechamento-do-dia'

/** O fechamento do dia, no portal da unidade: quem recebe fecha; o financeiro vê. */
export default async function FechamentoDaUnidadePage({ params, searchParams }: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ dia?: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  if (!podeReceber(ctx) && !can(ctx, 'financial', 'VIEW')) throw semAcesso()
  const sp = await searchParams

  const unidade = await ler(createAdminClient().from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()

  return (
    <FechamentoDoDia ctx={ctx} unidades={[{ id: unidade.id as string, name: unidade.name as string }]}
      unidadeId={unidade.id as string} diaPedido={sp.dia} basePath={`/${slug}/fechamento`} />
  )
}
