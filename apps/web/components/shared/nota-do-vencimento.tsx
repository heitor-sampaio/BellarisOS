import { formatBRL } from '@estetica-os/utils'
import type { ProximoVencimento } from '@/lib/metrics/queries'

/** "05/11" — o dia vem do banco já no fuso da clínica ("2026-11-05"). */
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

/**
 * A linha de baixo do "A receber" / "A pagar" (A34 da simulação de
 * 2026-10-27): o período vale pelo VENCIMENTO, e com zero no período, o
 * próximo vencimento ("Próximo: R$ 300,00 em 05/11") — sem isso, a conta que
 * vence no mês seguinte parecia ter sumido. Os números vêm de
 * `getEmAberto` (lib/metrics); aqui só se escreve.
 */
export function NotaDoVencimento({ valor, proximo }: { valor: number; proximo: ProximoVencimento | null }) {
  return (
    <span>
      Pelo vencimento, no período.
      {valor === 0 && proximo && <> Próximo: <strong>{formatBRL(proximo.valor)} em {diaCurto(proximo.dia)}</strong>.</>}
    </span>
  )
}
