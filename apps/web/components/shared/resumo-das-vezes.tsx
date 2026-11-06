'use client'

import { resumoDasParcelas, resumoDasVezes } from '@/lib/checkout/resumo-do-pagamento'

/**
 * O que o "Vezes no cartão" quer dizer (A47 da 5ª simulação): até quantas
 * vezes a clínica parcela no crédito (D-15) e, escolhidas as vezes, o valor
 * de cada parcela na maquininha.
 */
export function DicaDasVezes({ total, vezes, opcoes }: { total: number; vezes: number; opcoes: number[] }) {
  const maximo = opcoes.length ? opcoes[opcoes.length - 1]! : 1
  if (maximo <= 1) return null
  const parcela = resumoDasVezes(total, vezes)
  return (
    <span data-valor-da-parcela style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
      {/* A40 da 8ª: à vista, a linha solta "Até 12x no crédito" não dizia para quê. */}
      {vezes <= 1
        ? `À vista · parcela até ${maximo}x no crédito em “Vezes no cartão”`
        : `Até ${maximo}x no crédito${parcela ? ` · ${parcela}` : ''}`}
    </span>
  )
}

/**
 * O resumo do "Entrada + parcelas" antes de vender (A46 da 5ª simulação: só
 * aparecia "Vender por R$ 3.300,00"): "Entrada R$ 300,00 + 3× R$ 1.000,00",
 * a mesma divisão dos lançamentos.
 */
export function ResumoDasParcelas({ total, entrada, parcelas }: { total: number; entrada: number; parcelas: number }) {
  const texto = resumoDasParcelas(total, entrada, parcelas)
  if (!texto) return null
  return (
    <p data-resumo-do-pagamento style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 700 }}>
      {texto}
    </p>
  )
}
