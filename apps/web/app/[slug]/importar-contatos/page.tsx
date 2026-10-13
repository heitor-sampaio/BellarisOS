import { notFound } from 'next/navigation'
import { getTenantContext, assertAnyPermission, alcancaUnidade, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { ImportarContatos } from '@/app/_shared/importar-contatos'

/** Importar contatos pelo portal da unidade: os clientes vão para ela. */
export default async function ImportarContatosDaUnidadePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await getTenantContext()
  assertAnyPermission(ctx, ['clients', 'crm'], 'MANAGE')
  const unidade = await ler(createAdminClient().from('branches').select('id, name')
    .eq('slug', slug).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
  if (!unidade || !alcancaUnidade(ctx, unidade.id as string)) notFound()
  return (
    <ImportarContatos
      unidadeFixa={{ id: unidade.id as string, nome: unidade.name as string }}
      voltarPara={can(ctx, 'clients', 'VIEW') ? `/${slug}/clients` : `/${slug}/oportunidades`}
    />
  )
}
