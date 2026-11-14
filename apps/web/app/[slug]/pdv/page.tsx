import { notFound } from 'next/navigation'
import { getTenantContext, podeReceber, alcancaUnidade } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { Pdv } from '@/app/_shared/pdv'

/** O PDV, no portal da unidade (PDV1): de quem recebe — o PDV ou o Financeiro em Gerenciar. */
export default async function PdvDaUnidadePage({ params, searchParams }: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ ver?: string; comanda?: string; nova?: string; cliente?: string }>
}) {
  const { slug } = await params
  const ctx = await getTenantContext()
  if (!podeReceber(ctx)) throw semAcesso()
  const sp = await searchParams

  const unidade = await ler(createAdminClient().from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()

  return (
    <Pdv ctx={ctx} unidades={[{ id: unidade.id as string, name: unidade.name as string }]}
      unidadeId={unidade.id as string} slugDaUnidade={slug} basePath={`/${slug}/pdv`}
      ver={sp.ver} comandaId={sp.comanda} nova={sp.nova} clienteId={sp.cliente} />
  )
}
