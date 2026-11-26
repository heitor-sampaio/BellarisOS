import { quantidadeComMedida } from '@/lib/estoque/medidas'

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

/** O artigo e o nome da embalagem na frase ("do frasco", "da seringa"); sigla ou medida → "da embalagem". */
const EMBALAGEM_NA_FRASE: Record<string, string> = {
  frasco: 'do frasco', seringa: 'da seringa', ampola: 'da ampola', cx: 'da caixa', rolo: 'do rolo', par: 'do par',
  pote: 'do pote',
}

const mdc = (a: number, b: number): number => (b === 0 ? a : mdc(b, a % b))

/**
 * Quanto a quantidade do insumo é da EMBALAGEM (A7 da 17ª simulação; princípio
 * 3): a toxina "frasco de 100 U" se lança em U, e "1 U" ao lado de R$ 6,00 não
 * dizia que é 1/100 do frasco. "1/100 do frasco", "3/10 do frasco", "2 frascos";
 * a parte que não fecha numa fração simples sai em percentual ("23,3% da
 * embalagem"). Nulo quando o produto não tem unidade de consumo (o insumo já
 * está na embalagem) ou não há quantidade.
 */
export function parteDaEmbalagem(p: UnidadesDoProduto, quantidade: number | null | undefined): string | null {
  const porEmbalagem = Number(p.units_per_package)
  if (!p.consumption_unit || !(porEmbalagem > 0) || !quantidade || !(quantidade > 0)) return null
  const parte = quantidade / porEmbalagem
  if (parte >= 1) return quantidadeComMedida(parte, p.unit, 2)
  const naFrase = EMBALAGEM_NA_FRASE[(p.unit ?? '').toLowerCase()] ?? 'da embalagem'
  const vezes = porEmbalagem / quantidade
  if (Math.abs(vezes - Math.round(vezes)) < 1e-9) return `1/${Math.round(vezes)} ${naFrase}`
  if (Number.isInteger(quantidade) && Number.isInteger(porEmbalagem)) {
    const d = mdc(quantidade, porEmbalagem)
    return `${quantidade / d}/${porEmbalagem / d} ${naFrase}`
  }
  return `${(parte * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${naFrase}`
}

/**
 * A linha embaixo do nome do insumo no atendimento (A9 da 18ª simulação;
 * princípio 3): repetia só a unidade ("ml"), sem número. Agora a quantidade e,
 * no produto com unidade de consumo, a parte da embalagem: "1 ml · 1 seringa",
 * "0,5 ml · 1/2 da seringa". Sem embalagem, "2 un".
 */
export function linhaDoInsumo(quantidade: number, unidade: string, produto?: UnidadesDoProduto | null): string {
  const qtd = quantidadeComMedida(quantidade, unidade, 4)
  const parte = produto ? parteDaEmbalagem(produto, quantidade) : null
  return parte ? `${qtd} · ${parte}` : qtd
}
