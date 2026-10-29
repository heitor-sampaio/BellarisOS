/**
 * A unidade em que o INSUMO se lança e se mostra — puro, serve à tela e ao
 * servidor.
 *
 * O produto com unidade de consumo (`units_per_package` + `consumption_unit`)
 * se compra em embalagens (o frasco) e se aplica na unidade de consumo (o ml):
 * a quantidade do insumo — no procedimento, no plano e no atendimento — está
 * em ml (D1 de 2026-10-27). Sem unidade de consumo, é a do produto.
 *
 * Era uma regra repetida em cada tela, e o plano de tratamento a esqueceu:
 * mostrava "5 frasco" para os 5 ml do Peeling (D9 da simulação de 2026-10-29).
 */
export interface UnidadesDoProduto {
  unit:               string
  consumption_unit:   string | null
  units_per_package:  number | string | null
}

export function unidadeDoInsumo(p: UnidadesDoProduto): string {
  return p.consumption_unit && Number(p.units_per_package) > 0 ? p.consumption_unit : p.unit
}
