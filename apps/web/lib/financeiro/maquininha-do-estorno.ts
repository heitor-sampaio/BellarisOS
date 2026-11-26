import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * A maquininha de cada estorno (A24 da 32ª, princípio 3): o contra-lançamento
 * do estorno é uma SAÍDA, e a saída não leva maquininha (o gatilho
 * `maquininha_do_lancamento` a zera) — a linha do estorno ficava "Crédito 3x"
 * sem dizer em qual. A maquininha é a do pagamento estornado (`estorno_de`).
 * Devolve o id da maquininha por id do estorno; quem mostra passa por
 * `maquininhaDoRotulo` (com uma maquininha só, nada se diz).
 */
export async function maquininhaDosEstornos(tenantId: string, idsDosEstornos: readonly string[]): Promise<Record<string, string>> {
  const ids = [...new Set(idsDosEstornos)]
  if (!ids.length) return {}
  const admin = createAdminClient()
  const resultado: Record<string, string> = {}
  // Em lotes: a lista do período pode ter muitos estornos, e o `in` vai na URL.
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    const estornos = await ler(admin.from('financial_transactions').select('id, estorno_de, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenantId).in('id', lote).not('estorno_de', 'is', null), 'ler os estornos') as
      { id: string; estorno_de: string }[] | null
    const originais = [...new Set((estornos ?? []).map(e => e.estorno_de))]
    if (!originais.length) continue
    const pagamentos = await ler(admin.from('financial_transactions').select('id, maquininha_id, branches!inner(tenant_id)')
      .eq('branches.tenant_id', tenantId).in('id', originais).not('maquininha_id', 'is', null), 'ler a maquininha dos pagamentos estornados') as
      { id: string; maquininha_id: string }[] | null
    const daOriginal = new Map((pagamentos ?? []).map(p => [p.id, p.maquininha_id]))
    for (const e of estornos ?? []) {
      const m = daOriginal.get(e.estorno_de)
      if (m) resultado[e.id] = m
    }
  }
  return resultado
}
