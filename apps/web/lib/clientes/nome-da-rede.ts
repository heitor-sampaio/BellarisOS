import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { falaDaRede, type FalaDaRede } from './fala-da-rede'

/**
 * O nome da rede da unidade do ENDEREÇO (o slug é único no sistema inteiro,
 * `branches_slug_unico`), para o portal da cliente dizer o nome no lugar de
 * "clínica" (CA1). Uma leitura por requisição (`cache`): o layout e a página
 * dividem.
 */
export const nomeDaRedeDoPortal = cache(async (slug: string): Promise<string | null> => {
  const admin = createAdminClient()
  const unidade = await ler(admin.from('branches').select('tenant_id').eq('slug', slug).maybeSingle(),
    'buscar a unidade do endereço') as { tenant_id: string } | null
  if (!unidade) return null
  const rede = await ler(admin.from('tenants').select('name').eq('id', unidade.tenant_id).maybeSingle(),
    'buscar o nome da rede') as { name: string | null } | null
  return rede?.name?.trim() || null
})

/** As frases do portal com o nome da rede do endereço. */
export async function falaDaRedeDoPortal(slug: string): Promise<FalaDaRede> {
  return falaDaRede(await nomeDaRedeDoPortal(slug))
}

/** O nome da rede pelo id — para as actions do portal, que já leram a rede da ficha. */
export const nomeDaRede = cache(async (tenantId: string): Promise<string | null> => {
  const rede = await ler(createAdminClient().from('tenants').select('name').eq('id', tenantId).maybeSingle(),
    'buscar o nome da rede') as { name: string | null } | null
  return rede?.name?.trim() || null
})

/** As frases da cliente com o nome da rede da ficha (as recusas das actions do portal). */
export async function falaDaRedeDoId(tenantId: string): Promise<FalaDaRede> {
  return falaDaRede(await nomeDaRede(tenantId))
}
