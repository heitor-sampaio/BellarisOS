'use client'

import { resumoDasParcelas, resumoDasVezes } from '@/lib/checkout/resumo-do-pagamento'
import { avisoDasVezesNoCartao } from '@/lib/financeiro/vezes-do-cartao'

/**
 * O que o "Vezes no cartão" quer dizer (A47 da 5ª simulação): até quantas
 * vezes a clínica parcela no crédito (D-15) e, escolhidas as vezes, o valor
 * de cada parcela na maquininha.
 *
 * A20 da 32ª (MQ-01, decisão do Claude: o aviso vale em todo campo de vezes):
 * acima de 12x, avisa — e a venda segue (princípio 2).
 */
export function DicaDasVezes({ total, vezes, opcoes }: { total: number; vezes: number; opcoes: number[] }) {
  const maximo = opcoes.length ? opcoes[opcoes.length - 1]! : 1
  if (maximo <= 1) return null
  const parcela = resumoDasVezes(total, vezes)
  const aviso = avisoDasVezesNoCartao(vezes)
  return (
    <>
      <span data-valor-da-parcela style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
        {/* A40 da 8ª: à vista, a linha solta "Até 12x no crédito" não dizia para quê. */}
        {textoDaDicaDasVezes(maximo, vezes, parcela)}
      </span>
      {aviso && (
        <span role="status" data-aviso-das-vezes style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 600 }}>
          {aviso}
        </span>
      )}
    </>
  )
}

/** O texto da dica das vezes no cartão (pura: o teste a chama). */
export function textoDaDicaDasVezes(maximo: number, vezes: number, parcela: string | null | undefined): string {
  return vezes <= 1
    ? `À vista · até ${maximo}x no crédito`
    : `Até ${maximo}x no crédito${parcela ? ` · ${parcela}` : ''}`
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
