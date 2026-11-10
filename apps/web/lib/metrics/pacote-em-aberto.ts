import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/** O que a cliente ainda deve de um pacote (o crediário): o total e quantos lançamentos. */
export interface EmAbertoDoPacote { valor: number; parcelas: number }

/**
 * A41 da 11ª simulação: o pacote vendido no crediário libera as sessões (a
 * regra fica — princípio 1), e a ficha e o agendar da sessão dizem o que ainda
 * está em aberto dele (princípio 2: avisar). Contado no banco
 * (`metrics_em_aberto_dos_pacotes`) — a tela não soma.
 */
export async function getEmAbertoDosPacotes(tenantId: string, pacotes: string[]): Promise<Record<string, EmAbertoDoPacote>> {
  const ids = [...new Set(pacotes.filter(Boolean))]
  if (!ids.length) return {}
  // A lista vai no corpo (rpc é POST), não na URL.
  const { data, error } = await createAdminClient().rpc('metrics_em_aberto_dos_pacotes', { p_tenant: tenantId, p_pacotes: ids })
  if (error) throw new Error(`Não consegui ler o em aberto dos pacotes: ${error.message}`)
  const saida: Record<string, EmAbertoDoPacote> = {}
  for (const l of (data ?? []) as { client_package_id: string; em_aberto: number | string; parcelas: number }[]) {
    saida[l.client_package_id] = { valor: Number(l.em_aberto), parcelas: Number(l.parcelas) }
  }
  return saida
}
