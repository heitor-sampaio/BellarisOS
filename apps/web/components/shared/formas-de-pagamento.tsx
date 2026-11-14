'use client'

import { QrCode, Banknote, CreditCard, Wallet, type LucideIcon } from 'lucide-react'
import { rotuloDaForma } from '@/lib/financeiro/formas'

/** As formas com que a cliente paga no balcão, na ordem do PDV. */
export const FORMAS_DO_BALCAO = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'INTERNAL_CREDIT'] as const

const ICONE: Record<string, LucideIcon> = {
  PIX: QrCode, CASH: Banknote, DEBIT_CARD: CreditCard, CREDIT_CARD: CreditCard, INTERNAL_CREDIT: Wallet,
}

/**
 * A forma de pagamento em blocos, com o ícone (o PDV, desenho aprovado pelo
 * Heitor em 2026-11-13). Nasce em branco: "não existe pagamento sem forma de
 * pagamento" (PDV8) — quem usa não libera o "Receber" sem ela. É um grupo de
 * rádios (o teclado e o leitor de tela a leem como uma escolha só); o
 * `name` leva o valor no formulário.
 *
 * Exceção ao SegSelect (2–5 opções fixas): no balcão a forma é o gesto mais
 * repetido do dia, e o bloco com ícone é o alvo grande que o toque pede.
 */
export function FormasDePagamento({ valor, aoMudar, name, formas = FORMAS_DO_BALCAO }: {
  valor:   string
  aoMudar: (forma: string) => void
  name?:   string
  formas?: readonly string[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span id="formas-de-pagamento-rotulo" className="field-label">Forma de pagamento *</span>
      <div role="radiogroup" aria-labelledby="formas-de-pagamento-rotulo" className="formas-de-pagamento">
        {formas.map(f => {
          const Icone = ICONE[f] ?? CreditCard
          const marcada = valor === f
          return (
            <button key={f} type="button" role="radio" aria-checked={marcada} data-forma={f}
              className={marcada ? 'forma-de-pagamento is-marcada' : 'forma-de-pagamento'}
              onClick={() => aoMudar(f)}>
              <Icone size={18} aria-hidden />
              {rotuloDaForma(f)}
            </button>
          )
        })}
      </div>
      {name && <input type="hidden" name={name} value={valor} />}
    </div>
  )
}
