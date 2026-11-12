import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { CREDIARIO_PADRAO, recusaDasParcelas } from './parcelas-do-crediario'

/**
 * O limite de parcelas do crediário DA REDE (C38), lido do banco
 * (`tenants.crediario_max_parcelas`, padrão 12).
 *
 * Fora de `actions/`: recebe a rede por parâmetro, e quem chama já conferiu a
 * sessão.
 */
export async function maximoDeParcelasDaRede(tenantId: string): Promise<number> {
  const rede = await ler(createAdminClient().from('tenants').select('crediario_max_parcelas').eq('id', tenantId).maybeSingle(),
    'ler o limite de parcelas do crediário')
  return Number(rede?.crediario_max_parcelas ?? CREDIARIO_PADRAO)
}

/** A recusa para o crediário em `parcelas` vezes nesta rede, ou `null`. Sem crediário, nunca lê o banco. */
export async function recusaDasParcelasDaRede(tenantId: string, pagamento: { forma?: string; parcelas?: number } | null | undefined): Promise<string | null> {
  if (pagamento?.forma !== 'PARCELADO' || !(Number(pagamento.parcelas) > 1)) return null
  return recusaDasParcelas(Number(pagamento.parcelas), await maximoDeParcelasDaRede(tenantId))
}
