import 'server-only'
import { quemDesfazNoCaixa } from '@/lib/equipe/quem-desfaz'

/**
 * Quem cancela o plano ou o pacote de cada cartão do "Tratamento em andamento"
 * da ficha (D5 da 42ª; DP-08: cancela quem tem o Financeiro em Gerenciar com a
 * unidade DO registro ao alcance). A ficha pedia a lista pela unidade do
 * PORTAL: o plano de Arapongas, aberto em Apucarana, dizia "Genival", que não
 * alcança Arapongas. Uma leitura por unidade (são poucas); o cartão sem
 * unidade usa a do portal (`reserva`).
 */
export async function quemCancelaNosCartoes(
  tenantId: string,
  cartoes: { id: string; unidadeId: string | null }[],
  reserva: string | null,
): Promise<Map<string, string[]>> {
  const unidades = [...new Set(cartoes.map(c => c.unidadeId ?? reserva))]
  const listas = new Map<string | null, string[]>(await Promise.all(
    unidades.map(async unidade => [unidade, await quemDesfazNoCaixa(tenantId, unidade)] as const),
  ))
  return new Map(cartoes.map(c => [c.id, listas.get(c.unidadeId ?? reserva) ?? []]))
}
