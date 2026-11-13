import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { recusaDasVezes } from './vezes-do-cartao'
import { type CartaoPorBandeira } from './bandeiras'
import { lerMaquininha, maquininhaDaVenda, maximoDaMaquininha, parcelasComTaxa, type Maquininha } from './maquininhas'
import { maximoDeVezes } from './vezes-do-cartao'

/**
 * As maquininhas da rede (C75), na ordem da tela — as arquivadas no fim.
 * Fora de `actions/`: recebe a rede por parâmetro, e quem chama já conferiu a
 * sessão.
 */
export async function maquininhasDaRede(tenantId: string): Promise<Maquininha[]> {
  const linhas = await ler(createAdminClient().from('maquininhas')
    .select('id, nome, ordem, taxas, max_vezes, prazo_dias, cobra_por_bandeira, por_bandeira, arquivada_em, created_at')
    .eq('tenant_id', tenantId).order('ordem').order('created_at').order('id'), 'ler as maquininhas')
  const lista = ((linhas ?? []) as Record<string, unknown>[]).map(lerMaquininha)
  return [...lista.filter(m => !m.arquivada), ...lista.filter(m => m.arquivada)]
}

/**
 * O limite de vezes no crédito (D-15) da MAQUININHA da venda (C75): a
 * escolhida, senão a primeira ativa (a que o banco põe). O "Parcelar até" que
 * a clínica gravou nela ou, sem ele, a maior parcela do crédito com taxa.
 */
export async function maximoDeVezesDaRede(tenantId: string, maquininhaId?: string | null): Promise<{ maximo: number; configurado: number | null; padrao: number; prazoDias: number; porBandeira: CartaoPorBandeira }> {
  const m = maquininhaDaVenda(await maquininhasDaRede(tenantId), maquininhaId)
  if (!m) return { maximo: maximoDeVezes(null, []), configurado: null, padrao: maximoDeVezes(null, []), prazoDias: 30, porBandeira: {} }
  return {
    maximo: maximoDaMaquininha(m),
    configurado: m.maxVezes,
    padrao: maximoDeVezes(null, parcelasComTaxa(m)),
    prazoDias: m.prazoDias,
    porBandeira: m.cobraPorBandeira ? m.porBandeira : {},
  }
}

/**
 * A recusa do cartão desta venda (D-15 e C75), ou `null`:
 * - a maquininha que não é da rede (o banco também recusa);
 * - com `metodo` no cartão e MAIS DE UMA maquininha ativa, a venda sem
 *   maquininha — princípio 3: a primeira não vale calada quando há escolha;
 * - as vezes acima do "Parcelar até" da maquininha (ou da primeira).
 * À vista, sem maquininha e sem `metodo` no cartão, nunca lê o banco.
 */
export async function recusaDasVezesDaRede(tenantId: string, vezes: number, maquininhaId?: string | null, metodo?: string | null): Promise<string | null> {
  const noCartao = metodo === 'CREDIT_CARD' || metodo === 'DEBIT_CARD'
  if (!(vezes > 1) && !maquininhaId && !noCartao) return null
  const lista = await maquininhasDaRede(tenantId)
  if (maquininhaId && !lista.some(m => m.id === maquininhaId)) return 'Esta maquininha não é desta clínica.'
  if (noCartao && !maquininhaId && lista.filter(m => !m.arquivada).length > 1) return 'Escolha a maquininha do cartão.'
  if (!(vezes > 1)) return null
  const m = maquininhaDaVenda(lista, maquininhaId)
  return recusaDasVezes(vezes, m ? maximoDaMaquininha(m) : maximoDeVezes(null, []))
}

/** A taxa do Pix da rede (C75: fora das maquininhas; padrão 0%). */
export async function taxaDoPixDaRede(tenantId: string): Promise<number> {
  const t = await ler(createAdminClient().from('tenants').select('pix_taxa_pct').eq('id', tenantId).maybeSingle(),
    'ler a taxa do Pix') as { pix_taxa_pct: number | string | null } | null
  return Number(t?.pix_taxa_pct ?? 0)
}

/**
 * A18 da 14ª (F75): os nomes das maquininhas da rede (as arquivadas também — o
 * pagamento antigo foi nelas), para o rótulo do pagamento
 * (`rotuloDaForma(…, { maquininha })`). Nulo com uma só ou nenhuma: o nome não
 * vai ao rótulo (`maquininhaDoRotulo`).
 */
export async function nomesDasMaquininhas(tenantId: string): Promise<Record<string, string> | null> {
  const lista = await maquininhasDaRede(tenantId)
  if (lista.length < 2) return null
  return Object.fromEntries(lista.map(m => [m.id, m.nome]))
}
