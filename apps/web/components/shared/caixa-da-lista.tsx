/**
 * "N lançamentos · caixa da lista R$ …" (FN-13): o caixa do que está na lista
 * — o pago que entrou menos o pago que saiu (`resultadoDaLista`, lib/metrics).
 * A MESMA linha na lista da unidade e na da rede (D10 da 39ª: a rede dizia só
 * "N registros"). Quem chama passa o número já contado; aqui só se desenha.
 */
export function CaixaDaLista({ lancamentos, caixa }: { lancamentos: number; caixa: number }) {
  const valor = Math.abs(caixa).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    // A31 da 9ª: é o CAIXA da lista (o pago que entrou − o que saiu), não o resultado do período (o Lucro).
    <span data-total-da-lista title="O caixa do que está na lista: o pago que entrou menos o pago que saiu. O resultado do período (o Lucro, no Resumo) é outra conta." style={{
      marginLeft: 'auto', fontSize: 'var(--text-sm-sz)', fontWeight: 800,
      color: caixa >= 0 ? 'var(--success)' : 'var(--danger)',
    }}>
      {`${lancamentos} lançamento${lancamentos !== 1 ? 's' : ''} · caixa da lista ${caixa < 0 ? '−' : ''}${valor}`}
    </span>
  )
}
