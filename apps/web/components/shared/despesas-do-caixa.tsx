import { formatBRL } from '@estetica-os/utils'
import type { EstoqueNoResultado } from '@/lib/metrics/resultado'

/** O que o caixa tem e o lucro não desconta de novo: as parcelas de lib/metrics, sem conta. */
export interface ForaDoLucro { compraDeEstoque: number; despesaDeComissoes: number }
export function foraDoLucro(e: EstoqueNoResultado): ForaDoLucro {
  return { compraDeEstoque: e.compraDeEstoque, despesaDeComissoes: e.despesaDeComissoes ?? 0 }
}

/**
 * A dica do cartão "Despesas pagas (caixa)" nos dois financeiros (A5 da 28ª;
 * princípio 3): o pagamento das comissões subia o cartão (R$ 480 → R$ 1.258,31)
 * e o Lucro não mudava — a dica dizia que o lucro usa a despesa operacional,
 * mas não QUANTO do caixa ficava fora dele, e os dois cartões pareciam se
 * contradizer. Agora diz o valor de cada parte. Os números são os do
 * resultado (lib/metrics: a compra de estoque paga e a despesa paga
 * "Comissões", `EstoqueNoResultado`); aqui só se escrevem.
 */
export function DespesasDoCaixa({ compraDeEstoque, despesaDeComissoes, nomeDoLucro }: {
  compraDeEstoque: number
  despesaDeComissoes: number
  /** "Lucro Líquido" (a unidade) ou "Resultado líquido" (a rede). */
  nomeDoLucro: string
}) {
  const partes = [
    despesaDeComissoes > 0 ? `${formatBRL(despesaDeComissoes)} do pagamento das comissões` : null,
    compraDeEstoque > 0 ? `${formatBRL(compraDeEstoque)} da compra de estoque` : null,
  ].filter((x): x is string => x !== null)
  return (
    <span data-despesas-do-caixa>
      O que saiu do caixa no período.
      {partes.length > 0 ? (
        <span data-fora-do-lucro style={{ display: 'block', marginTop: 4 }}>
          Deste valor, {partes.join(' e ')} ficam fora do {nomeDoLucro}: a comissão já sai do lucro quando é lançada, e o
          produto, quando é usado ou vendido.
        </span>
      ) : (
        <span style={{ display: 'block', marginTop: 4 }}>
          A compra de estoque e o pagamento das comissões, quando houver, entram aqui e ficam fora do {nomeDoLucro} (a conta está na dica dele).
        </span>
      )}
    </span>
  )
}
