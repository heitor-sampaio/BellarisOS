import { getCachedNetworkBranches, getCachedRede } from '@/lib/cached-queries'
import { vocabulario } from '@/lib/unidades/vocabulario'

/**
 * A clínica de UMA unidade só (D-19, decisão do Heitor em 2026-10-29): "Com
 * UMA unidade ativa, somem os termos e gráficos de rede ('TOTAL REDE', 'por
 * unidade', os rankings de unidade, 'Voltar para a rede') e o seletor de
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
 * A fala da tela no SERVIDOR (PO2): com UMA unidade, o rótulo que é só a rede
 * vira o nome dela e "Admin da rede" vira "Admin" (`lib/unidades/vocabulario.ts`).
 */
export async function falaDaTela(tenantId: string | null | undefined): Promise<(texto: string) => string> {
  if (!tenantId) return (texto: string) => texto
  const [umaUnidade, rede] = await Promise.all([redeTemUmaUnidade(tenantId), getCachedRede(tenantId)])
  return vocabulario(umaUnidade, rede?.nome)
}

/**
 * O texto que o SERVIDOR devolve à tela (a recusa de uma action) na fala da
 * rede de uma unidade: "Admin da rede" vira "Admin" (r2-cfg-02, revisão do
 * Heitor de 2026-11-03: "Só quem é Admin da rede…" escapava, porque a recusa
 * nasce na action e a tela a mostra como veio).
 */
export async function falaDaRede(tenantId: string | null | undefined, texto: string): Promise<string> {
  return (await falaDaTela(tenantId))(texto)
}
