import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { FUSO_PADRAO, fusoComum, fusoValido } from '@/lib/unidades/fuso'

/**
 * O fuso de cada unidade da rede (F62), no servidor. Cache da rede inteira
 * (ativas e desativadas: o lançamento antigo de uma unidade fechada ainda tem
 * o dia dela), pela mesma tag das unidades — `updateBranch` a expira na hora.
 */
const fusosDaRede = (tenantId: string) => unstable_cache(
  async () => {
    const data = await ler(createAdminClient()
      .from('branches').select('id, fuso, is_active')
      .eq('tenant_id', tenantId), 'carregar o fuso das unidades')
    return ((data ?? []) as { id: string; fuso: string | null; is_active: boolean }[])
      .map(b => ({ id: b.id, fuso: fusoValido(b.fuso), ativa: b.is_active }))
  },
  [`fusos-da-rede-${tenantId}`],
  { revalidate: 600, tags: [`branches:${tenantId}`] },
)()

/** O fuso da unidade; sem ela (ou sem a rede), o de Brasília. */
export async function fusoDaUnidade(tenantId: string | null | undefined, branchId: string | null | undefined): Promise<string> {
  if (!tenantId || !branchId) return FUSO_PADRAO
  return (await fusosDaRede(tenantId)).find(b => b.id === branchId)?.fuso ?? FUSO_PADRAO
}

/**
 * O fuso de um recorte: o das unidades pedidas (sem elas, as ativas da rede),
 * se todas têm o mesmo; senão, o de Brasília. É o fuso da janela do período no
 * consolidado (a mesma regra de `fuso_do_recorte` no banco); o dia de cada
 * lançamento é o da unidade dele.
 */
export async function fusoDoRecorte(tenantId: string | null | undefined, branchIds?: readonly string[] | null): Promise<string> {
  if (!tenantId) return FUSO_PADRAO
  const todas = await fusosDaRede(tenantId)
  const escolhidas = branchIds?.length ? todas.filter(b => branchIds.includes(b.id)) : todas.filter(b => b.ativa)
  return fusoComum(escolhidas.map(b => b.fuso))
}

/** O fuso da rede: o das unidades ativas, se é um só; senão, o de Brasília. */
export const fusoDaRede = (tenantId: string | null | undefined) => fusoDoRecorte(tenantId, null)

/**
 * O fuso da unidade lido na hora, pelo cliente que o chamador já tem (o
 * núcleo da agenda, o cron): sem cache, para quem não tem a rede à mão.
 */
export async function lerFusoDaUnidade(
  admin: ReturnType<typeof createAdminClient>, branchId: string | null | undefined,
): Promise<string> {
  if (!branchId) return FUSO_PADRAO
  const b = await ler(admin.from('branches').select('fuso').eq('id', branchId).maybeSingle(), 'buscar o fuso da unidade') as { fuso?: string | null } | null
  return fusoValido(b?.fuso)
}
