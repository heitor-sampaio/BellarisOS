import { formatBRL } from '@estetica-os/utils'
import type { ResultadoDoPeriodo } from '@/lib/metrics/resultado'

/**
 * A conta do resultado, embaixo do "Lucro Líquido" (financeiro da unidade) e
 * do "Resultado líquido" (o da rede) — D8 da 8ª simulação (2026-11-06;
 * princípio 3, "o que a tela mostra é o que vale na conta"): a tela dizia
 * "Receita R$ 89 · Despesas R$ 0 · Comissões R$ 0 · Resultado líquido R$ 9",
 * e os R$ 80 de insumo e de custo do produto, que entram no resultado, não
 * apareciam em cartão nenhum. As parcelas são as de `resultadoDoPeriodo`
 * (lib/metrics), a mesma conta do DRE dos Relatórios; a tela só as escreve.
 */
export function ContaDoResultado({ receita, resultado, despesasDoCaixa, aPagar = 0 }: {
  receita:   number
  resultado: ResultadoDoPeriodo
  /** As despesas pagas do cartão (o caixa): quando passam da operacional, a tela diz por quê. */
  despesasDoCaixa: number
  /** A despesa em aberto que vence no período (o "A pagar" de lib/metrics): fora do resultado (D4 da 10ª). */
  aPagar?: number
}) {
  const ficaNoCaixa = Math.round(despesasDoCaixa * 100) !== Math.round(resultado.despesaOperacional * 100)
  return (
    <>
      <span data-conta-do-resultado>
        Receita {formatBRL(receita)} − despesas operacionais {formatBRL(resultado.despesaOperacional)}
        {' '}− insumos e produtos {formatBRL(resultado.insumoConsumido)}
        {' '}− taxas da maquininha {formatBRL(resultado.taxasDaMaquininha)}
        {' '}− comissões lançadas {formatBRL(resultado.comissoes)} = {formatBRL(resultado.lucro)}
      </span>
      {/* A31 da 9ª: qual "resultado" é este — o do período, não o caixa. D4 da 10ª:
          dizia "competência", e a despesa entra quando é PAGA, como a receita
          (indicadores.md, "Receita e despesa simétricas"); o a pagar fica fora, e a tela diz quanto. */}
      <span data-base-do-resultado style={{ display: 'block', marginTop: 2 }}>
        É o resultado do período: a receita e a despesa pelo que foi pago; o insumo quando é usado; a comissão quando é lançada. O total da lista de lançamentos é o caixa.
      </span>
      {aPagar > 0 && (
        <span data-a-pagar-fora-do-resultado style={{ display: 'block', marginTop: 2 }}>
          A pagar no período, fora do resultado: {formatBRL(aPagar)}
        </span>
      )}
      {ficaNoCaixa && (
        <span style={{ display: 'block', marginTop: 2 }}>
          Das despesas pagas ({formatBRL(despesasDoCaixa)}), a compra de estoque e o pagamento das comissões ficam no caixa, fora do resultado.
        </span>
      )}
    </>
  )
}
