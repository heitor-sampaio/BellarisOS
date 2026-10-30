import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { maximoDeVezes, recusaDasVezes } from './vezes-do-cartao'

/**
 * O limite de vezes no crédito DA REDE (D-15), lido do banco: o que a clínica
 * gravou (`tenants.cartao_max_vezes`) ou, sem ele, a maior parcela do crédito
 * com taxa em `payment_fees`.
 *
 * Fora de `actions/`: recebe a rede por parâmetro, e quem chama já conferiu a
 * sessão.
 */
export async function maximoDeVezesDaRede(tenantId: string): Promise<{ maximo: number; configurado: number | null; padrao: number }> {
  const admin = createAdminClient()
  const [rede, taxas] = await Promise.all([
    ler(admin.from('tenants').select('cartao_max_vezes').eq('id', tenantId).maybeSingle(), 'ler o limite de vezes no crédito'),
    ler(admin.from('payment_fees').select('parcelas').eq('tenant_id', tenantId).eq('metodo', 'CREDIT_CARD'),
      'ler as parcelas do crédito com taxa'),
  ])
  const configurado = (rede?.cartao_max_vezes as number | null | undefined) ?? null
  const parcelas = ((taxas ?? []) as { parcelas: number }[]).map(t => Number(t.parcelas))
  return {
    maximo: maximoDeVezes(configurado, parcelas),
    configurado,
    padrao: maximoDeVezes(null, parcelas),
  }
}

/** A recusa para `vezes` no crédito desta rede, ou `null`. À vista nunca lê o banco. */
export async function recusaDasVezesDaRede(tenantId: string, vezes: number): Promise<string | null> {
  if (!(vezes > 1)) return null
  const { maximo } = await maximoDeVezesDaRede(tenantId)
  return recusaDasVezes(vezes, maximo)
}
