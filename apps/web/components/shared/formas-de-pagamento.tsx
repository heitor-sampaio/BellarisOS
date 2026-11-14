'use client'

import { useId } from 'react'
import { QrCode, Banknote, CreditCard, Wallet, CalendarRange, Clock, CalendarCheck, type LucideIcon } from 'lucide-react'
import { rotuloDaForma } from '@/lib/financeiro/formas'

/** As formas com que a cliente paga no balcão, na ordem do PDV. */
export const FORMAS_DO_BALCAO = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'INTERNAL_CREDIT'] as const

/**
 * As formas de quem paga AGORA, sem o crédito na rede: a parcela do crediário
 * e o a receber recebidos no PDV ou no Financeiro (a baixa — as do "Novo
 * lançamento"). O crediário não paga uma parcela do crediário.
 */
export const FORMAS_DA_BAIXA = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const

const ICONE: Record<string, LucideIcon> = {
  PIX: QrCode, CASH: Banknote, DEBIT_CARD: CreditCard, CREDIT_CARD: CreditCard, INTERNAL_CREDIT: Wallet,
  CREDIARIO: CalendarRange, A_RECEBER: Clock, NADA_AGORA: CalendarCheck,
}

/**
 * Os blocos que não são meio de lançamento: o crediário (PDV8 — "o crediario
 * é uma forma de pagamento"), o a receber e o "no atendimento" do contrato.
 */
const ROTULO_FORA_DO_MEIO: Record<string, string> = {
  A_RECEBER: 'A receber', NADA_AGORA: 'No atendimento',
}

/**
 * A forma de pagamento em blocos, com o ícone (o PDV, desenho aprovado pelo
 * Heitor em 2026-11-13). Nasce em branco: "não existe pagamento sem forma de
 * pagamento" (PDV8) — quem usa não libera o "Receber" sem ela. É um grupo de
 * rádios (o teclado e o leitor de tela a leem como uma escolha só); o
 * `name` leva o valor no formulário.
 *
 * O Crediário (`CREDIARIO`) e o A receber (`A_RECEBER`) são blocos ao lado
 * dos meios (PDV8): quem chama decide o que cada um abre.
 *
 * Exceção ao SegSelect (2–5 opções fixas): no balcão a forma é o gesto mais
 * repetido do dia, e o bloco com ícone é o alvo grande que o toque pede.
 */
export function FormasDePagamento({ valor, aoMudar, name, formas = FORMAS_DO_BALCAO, rotulo = 'Forma de pagamento *', desligado = false }: {
  valor:   string
  aoMudar: (forma: string) => void
  name?:   string
  formas?: readonly string[]
  rotulo?: string
  desligado?: boolean
}) {
  const id = useId()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span id={id} className="field-label">{rotulo}</span>
      <div role="radiogroup" aria-labelledby={id} className="formas-de-pagamento">
        {formas.map(f => {
          const Icone = ICONE[f] ?? CreditCard
          const marcada = valor === f
          return (
            <button key={f} type="button" role="radio" aria-checked={marcada} data-forma={f} disabled={desligado}
              className={marcada ? 'forma-de-pagamento is-marcada' : 'forma-de-pagamento'}
              onClick={() => aoMudar(f)}>
              <Icone size={18} aria-hidden />
              {ROTULO_FORA_DO_MEIO[f] ?? rotuloDaForma(f)}
            </button>
          )
        })}
      </div>
      {name && <input type="hidden" name={name} value={valor} />}
    </div>
  )
}
