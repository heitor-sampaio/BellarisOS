import { formatBRL } from '@estetica-os/utils'

/**
 * A38 da 11ª simulação (2026-11-10; princípio 3): o "A receber da operadora"
 * não mostrava o débito (R$ 540 da Azaleia) nem dizia por quê. O débito e o
 * Pix não têm prazo configurado: contam como recebidos no dia da venda e
 * ficam fora deste cartão (princípio 4 — `vendas-financeiro.md` §9.6). O valor
 * é o da composição por forma do período (`metrics_financeiro_composicao`).
 */
export function NotaDoDebito({ debito }: { debito: number }) {
  return (
    <span data-debito-no-periodo style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 4 }}>
      {debito > 0
        ? <>Débito no período: {formatBRL(debito)} — conta como recebido no dia da venda (o débito e o Pix não passam por aqui).</>
        : <>O débito e o Pix contam como recebidos no dia da venda: não passam por aqui.</>}
    </span>
  )
}
