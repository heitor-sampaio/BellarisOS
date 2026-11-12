'use client'

import { Info } from 'lucide-react'
import { ehBandeira } from '@/lib/financeiro/bandeiras'
import { taxaNaMaquininha } from '@/lib/financeiro/maquininhas'
import { liquidoNaMaquininha } from '@/lib/metrics/resultado'
import { formatBRL } from '@estetica-os/utils'
import { useMaquininhas, maquininhaEscolhida } from '@/components/shared/use-maquininhas'

const pct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/**
 * O aviso de quem recebe no cartão de crédito (A33 da simulação de 2026-10-27):
 * sem a taxa daquelas vezes cadastrada na MAQUININHA da venda (C75), a venda
 * sai sem desconto da operadora (0% — F16-2: nunca a taxa de outras vezes), e
 * a tela diz. Com a taxa, a taxa e o líquido (A40 da 8ª), só a quem vê o
 * financeiro da clínica (A19 da 12ª). A conta é `taxaNaMaquininha` (o espelho
 * da do banco).
 */
export function AvisoDaTaxa({ vezes, bandeira, total, maquininha }: {
  vezes: number; bandeira?: string
  /** O valor no cartão: com a taxa cadastrada, a tela diz a taxa e o líquido (A40 da 8ª). */
  total?: number
  /** A maquininha escolhida; sem ela, a primeira (a que o banco põe). */
  maquininha?: string | null
}) {
  const leitura = useMaquininhas()
  const m = maquininhaEscolhida(leitura?.lista, maquininha)
  if (!leitura || !m) return null
  const { taxa } = taxaNaMaquininha(m, 'CREDIT_CARD', vezes, ehBandeira(bandeira) ? bandeira : null)
  const rotulo = vezes === 1 ? 'à vista' : `${vezes}x`
  const naMaquininha = leitura.lista.length > 1 ? ` (${m.nome})` : ''
  if (taxa != null) {
    if (!total || total <= 0 || !leitura.mostra) return null
    const conta = liquidoNaMaquininha(total, taxa)
    return (
      <p data-liquido-do-cartao role="note" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Taxa da maquininha{naMaquininha} no crédito {rotulo}: {pct(taxa)}% ({formatBRL(conta.taxa)}) — a clínica recebe {formatBRL(conta.liquido)}
        {vezes > 1 ? `, que a operadora deposita em ${vezes} parcelas` : ''}.
      </p>
    )
  }
  return (
    <p data-aviso-taxa role="note" style={{
      display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45,
    }}>
      <Info size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} aria-hidden />
      <span>
        {/* F16-2: sem a taxa exata, 0% — nunca a de outras vezes. */}
        Não há taxa da maquininha{naMaquininha} cadastrada para o crédito {rotulo}: a venda sai sem desconto da operadora (0%), também na comissão.
        {' '}Cadastre em Configurações → Comissões.
      </span>
    </p>
  )
}

/**
 * A taxa do DÉBITO que vai valer (A34 da 9ª simulação; princípio 3), na
 * maquininha da venda: a da bandeira (se a maquininha cobra diferente nela),
 * senão a da maquininha; sem nenhuma, que sai sem desconto (0%, F16-2).
 */
export function AvisoDaTaxaDoDebito({ bandeira, total, maquininha }: { bandeira?: string; total?: number; maquininha?: string | null }) {
  const leitura = useMaquininhas()
  const m = maquininhaEscolhida(leitura?.lista, maquininha)
  if (!leitura || !m) return null
  const { taxa, daBandeira } = taxaNaMaquininha(m, 'DEBIT_CARD', 1, ehBandeira(bandeira) ? bandeira : null)
  const naMaquininha = leitura.lista.length > 1 ? ` (${m.nome})` : ''
  if (taxa == null) {
    return (
      <p data-taxa-do-debito role="note" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Não há taxa da maquininha{naMaquininha} cadastrada para o débito: a venda sai sem desconto da operadora (0%). Cadastre em Configurações → Comissões.
      </p>
    )
  }
  if (!leitura.mostra) return null
  const deOnde = daBandeira ? ' — a da bandeira' : ''
  const conta = total && total > 0 ? liquidoNaMaquininha(total, taxa) : null
  return (
    <p data-taxa-do-debito role="note" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
      Taxa da maquininha{naMaquininha} no débito: {pct(taxa)}%{deOnde}
      {conta ? ` (${formatBRL(conta.taxa)}); a clínica recebe ${formatBRL(conta.liquido)}` : ''}.
    </p>
  )
}
