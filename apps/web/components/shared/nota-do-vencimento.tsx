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
export function NotaDoVencimento({ valor, proximo, emAbertoTotal, semCliente, concluidosSemPagamento, hrefDaBaixa, vencidas, hrefDasVencidas, podeDarBaixa = true, despesa = false, noTopoOEmAberto = false }: {
  valor: number
  /**
   * A17 da 30ª: a parte do em aberto SEM cliente (a sublocação, um aluguel),
   * de `getAReceberSemCliente`. O "A receber · em aberto" a soma (FN-11, todo o
   * em aberto), e a nota diz (princípio 3).
   */
  semCliente?: number
  /**
   * A17 da 23ª: o número grande do cartão é o em aberto — a nota diz o que
   * vence no período ("Vence no período: R$ …"), com o link da lista.
   */
  noTopoOEmAberto?: boolean
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
  /**
   * A42 da 12ª: quem só VÊ o financeiro (a contadora) não tem o "Pagar" na
   * linha — o link diz "Ver a lista", não "Ver e receber" (A25 da 24ª: era "Ver e dar baixa").
   */
  podeDarBaixa?: boolean
  /** A43 da 12ª: o "A pagar" (a despesa em aberto): "Ver e pagar". */
  despesa?: boolean
}) {
  // A explicação ("pelo vencimento, no período", o líquido e o bruto) mora na
  // dica do cartão — `DicaDoVencimento` (o Heitor, 2026-11-16: sem parágrafo
  // de explicação na tela). Aqui fica o que se lê e o que se faz.
  return (
    <span>
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
      {valor === 0 && proximo && <span style={{ display: 'block' }}>Próximo: <strong>{formatBRL(proximo.valor)} em {diaCurto(proximo.dia)}</strong></span>}
      {emAbertoTotal !== undefined && (
        <span data-em-aberto style={{ display: 'block', marginTop: 2 }}>
          {noTopoOEmAberto
            ? <span data-vence-no-periodo>Vence no período: <strong>{formatBRL(valor)}</strong></span>
            // A6 da 28ª: o recorte dito — ao lado do "vence no período" do número grande.
            : <>Em aberto, de qualquer vencimento: <strong>{formatBRL(emAbertoTotal)}</strong></>}
          {hrefDaBaixa && emAbertoTotal > 0 && (
            <> · <a href={hrefDaBaixa} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>{podeDarBaixa ? (despesa ? 'Ver e pagar' : 'Ver e receber') : 'Ver a lista'}</a></>
          )}
        </span>
      )}
      {semCliente !== undefined && semCliente > 0 && (
        <span data-a-receber-sem-cliente style={{ display: 'block', marginTop: 2 }}>
          Inclui sem cliente: <strong>{formatBRL(semCliente)}</strong>
        </span>
      )}
      {concluidosSemPagamento && concluidosSemPagamento.n > 0 && (
        <span data-concluidos-sem-pagamento style={{ display: 'block', marginTop: 2 }}>
          Concluídos sem pagamento: <strong>{formatBRL(concluidosSemPagamento.valor)}</strong>
          {' '}({concluidosSemPagamento.n} {concluidosSemPagamento.n === 1 ? 'atendimento' : 'atendimentos'})
        </span>
      )}
    </span>
  )
}

/**
 * A explicação do "A receber" / "A pagar" — na dica do cartão. O período vale
 * pelo VENCIMENTO; o "Em aberto" soma todos os vencimentos (D-14); na
 * operadora, o líquido (o que ela deposita) e o bruto (A30 da 9ª).
 */
export function DicaDoVencimento({ valor, bruto, emAbertoTotal, concluidos = false, semCliente = false }: {
  valor: number
  bruto?: { periodo: number; emAberto: number }
  emAbertoTotal?: number
  /** O "A receber · em aberto": diz o que é o "Concluídos sem pagamento". */
  concluidos?: boolean
  /** A17 da 30ª: diz o que é o "Inclui sem cliente". */
  semCliente?: boolean
}) {
  return (
    <span data-dica-do-vencimento>
      {bruto
        ? <>O valor é o líquido (o que a operadora deposita), pelo vencimento, no período{bruto.periodo > valor ? <> — {formatBRL(bruto.periodo)} bruto</> : null}.</>
        : <>O valor é o que vence no período (pelo vencimento).</>}
      {emAbertoTotal !== undefined && (
        <span style={{ display: 'block', marginTop: 4 }}>
          “Em aberto” soma todos os vencimentos, de qualquer mês{bruto ? <> ({formatBRL(bruto.emAberto)} bruto)</> : null}.
        </span>
      )}
      {concluidos && (
        <span style={{ display: 'block', marginTop: 4 }}>
          “Concluídos sem pagamento” são atendimentos feitos e não recebidos: não são lançamento em aberto e não se somam a ele.
        </span>
      )}
      {semCliente && (
        <span style={{ display: 'block', marginTop: 4 }}>
          “Inclui sem cliente” é o lançamento a receber que não é de uma cliente (a sublocação de uma sala, um aluguel): está somado no em aberto.
        </span>
      )}
    </span>
  )
}
