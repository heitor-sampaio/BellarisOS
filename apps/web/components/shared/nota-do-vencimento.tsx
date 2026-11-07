import { formatBRL } from '@estetica-os/utils'
import type { ProximoVencimento } from '@/lib/metrics/queries'
import type { AReceberVencido } from '@/lib/metrics/vencidas'

/** "05/11" — o dia vem do banco já no fuso da clínica ("2026-11-05"). */
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

/**
 * A linha de baixo do "A receber" / "A pagar" (A34 da simulação de
 * 2026-10-27): o período vale pelo VENCIMENTO, e com zero no período, o
 * próximo vencimento ("Próximo: R$ 300,00 em 05/11") — sem isso, a conta que
 * vence no mês seguinte parecia ter sumido. No "A receber", também o total em
 * aberto de qualquer vencimento (D-14, 2026-10-29: "Em aberto, todos os
 * vencimentos: R$ X") — o resto do crediário não aparecia em lugar nenhum.
 * Os números vêm de `getEmAberto` e `getAReceberEmAberto` (lib/metrics); aqui
 * só se escreve.
 */
export function NotaDoVencimento({ valor, proximo, emAbertoTotal, concluidosSemPagamento, hrefDaBaixa, vencidas, hrefDasVencidas }: {
  valor: number
  proximo: ProximoVencimento | null
  /** Todo o em aberto, de qualquer vencimento (só no "A receber"). */
  emAbertoTotal?: number
  /**
   * Os atendimentos CONCLUÍDOS sem pagamento ("Reforça", item 4 da 5ª):
   * separados e nomeados — não são lançamento em aberto, e não se somam a ele.
   */
  concluidosSemPagamento?: { n: number; valor: number }
  /**
   * A38 da 8ª: onde se dá baixa nesse em aberto — a lista dos lançamentos com
   * todo o a receber, de qualquer vencimento (`?aberto=todos`).
   */
  hrefDaBaixa?: string
  /** D13 da 9ª: o que já VENCEU (antes de hoje), de `getAReceberVencido`. */
  vencidas?: AReceberVencido
  /** Onde se vê só as vencidas (`?aberto=vencidas`). */
  hrefDasVencidas?: string
}) {
  return (
    <span>
      Pelo vencimento, no período.
      {vencidas && vencidas.quantidade > 0 && (
        <span data-vencidas style={{ display: 'block', marginTop: 2, color: 'var(--danger)', fontWeight: 600 }}>
          Vencidas: <strong>{formatBRL(vencidas.valor)}</strong>
          {' '}({vencidas.quantidade} {vencidas.quantidade === 1 ? 'parcela' : 'parcelas'}
          {vencidas.maisAntiga ? `, desde ${diaCurto(new Date(vencidas.maisAntiga).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))}` : ''})
          {hrefDasVencidas && (
            <> · <a href={hrefDasVencidas} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>Ver as vencidas</a></>
          )}
        </span>
      )}
      {valor === 0 && proximo && <> Próximo: <strong>{formatBRL(proximo.valor)} em {diaCurto(proximo.dia)}</strong>.</>}
      {emAbertoTotal !== undefined && (
        <span data-em-aberto style={{ display: 'block', marginTop: 2 }}>
          Em aberto, todos os vencimentos: <strong>{formatBRL(emAbertoTotal)}</strong>
          {hrefDaBaixa && emAbertoTotal > 0 && (
            <> · <a href={hrefDaBaixa} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>Ver e dar baixa</a></>
          )}
        </span>
      )}
      {concluidosSemPagamento && concluidosSemPagamento.n > 0 && (
        <span data-concluidos-sem-pagamento style={{ display: 'block', marginTop: 2 }}>
          Atendimentos concluídos sem pagamento: <strong>{formatBRL(concluidosSemPagamento.valor)}</strong>
          {' '}({concluidosSemPagamento.n} {concluidosSemPagamento.n === 1 ? 'atendimento' : 'atendimentos'})
        </span>
      )}
    </span>
  )
}
