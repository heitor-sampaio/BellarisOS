import { getCachedNetworkBranches } from '@/lib/cached-queries'
import { vocabulario } from '@/lib/unidades/vocabulario'

/**
 * A clínica de UMA unidade só (D-19, decisão do Heitor em 2026-10-29): "Com
 * UMA unidade ativa, somem os termos e gráficos de rede ('TOTAL REDE', 'por
 * filial', os rankings de filial, 'Voltar para a rede') e o seletor de
 * unidade. O modelo não muda: tudo volta quando nascer a segunda unidade."
 *
 * É a régua ÚNICA das telas: a contagem das unidades ATIVAS da rede, pelo
 * cache das unidades (`getCachedNetworkBranches`, tag `branches:<rede>`, que
 * criar, editar e ativar/desativar unidade expiram na hora). Tela que só tem a
 * lista de unidades ativas na mão usa `umaUnidadeSo(lista.length)` — a mesma
 * regra.
 */
export function umaUnidadeSo(unidadesAtivas: number): boolean {
  return unidadesAtivas === 1
}

export async function redeTemUmaUnidade(tenantId: string): Promise<boolean> {
  const unidades = await getCachedNetworkBranches(tenantId)
  return umaUnidadeSo(unidades.length)
}

/**
 * O texto que o SERVIDOR devolve à tela (a recusa de uma action) na fala da
 * clínica: com UMA unidade, "rede" vira "clínica" e "Admin da rede", "Admin"
 * (`lib/unidades/vocabulario.ts`). r2-cfg-02 (revisão do Heitor de 2026-11-03):
 * "Só quem é Admin da rede…" escapava, porque a recusa nasce na action e a
 * tela a mostra como veio.
 */
export async function falaDaRede(tenantId: string | null | undefined, texto: string): Promise<string> {
  if (!tenantId) return texto
  return vocabulario(await redeTemUmaUnidade(tenantId))(texto)
}
