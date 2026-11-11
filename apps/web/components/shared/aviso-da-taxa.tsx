'use client'

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { taxasDoCartaoDeCredito, cartaoPorBandeiraDaRede, taxaDoDebito, mostraOLiquidoDaMaquininha } from '@/actions/comissoes'
import { ehBandeira, taxaDoCreditoNaBandeira, type CartaoPorBandeira } from '@/lib/financeiro/bandeiras'
import { liquidoNaMaquininha } from '@/lib/metrics/resultado'
import { formatBRL } from '@estetica-os/utils'

/**
 * O aviso de quem recebe no cartão de crédito em N vezes sem a taxa da
 * maquininha de N vezes cadastrada (A33 da simulação de 2026-10-27): a venda
 * sai sem desconto da operadora (0% — F16-2: nunca a taxa de outras vezes), e
 * a tela não dizia. As taxas se cadastram em Configurações → Comissões (1x a
 * 12x). Só aparece no crédito; a conta é `taxaDoCreditoNaBandeira` (o espelho da do banco).
 */
export function AvisoDaTaxa({ vezes, bandeira, total }: {
  vezes: number; bandeira?: string
  /** O valor no cartão: com a taxa cadastrada, a tela diz a taxa e o líquido (A40 da 8ª). */
  total?: number
}) {
  const [taxas, setTaxas] = useState<{ parcelas: number; taxa_pct: number }[] | null>(null)
  const [porBandeira, setPorBandeira] = useState<CartaoPorBandeira>({})
  // A19 da 12ª: a taxa e o líquido só a quem vê o financeiro da clínica.
  const [mostra, setMostra] = useState(false)
  useEffect(() => {
    let vivo = true
    Promise.all([taxasDoCartaoDeCredito(), cartaoPorBandeiraDaRede(), mostraOLiquidoDaMaquininha()])
      .then(([t, b, m]) => { if (vivo) { setTaxas(t); setPorBandeira(b); setMostra(m) } })
      // Só um aviso: sem ele a tela segue, e o motivo vai ao console.
      .catch(e => console.error('[pagamento] taxas do cartão:', e))
    return () => { vivo = false }
  }, [])
  if (!taxas) return null
  // r4-f15-01: a bandeira vale com a taxa EXATA destas vezes; senão, a regra
  // geral destas vezes (a conta de private.comissao_taxa_pct com a bandeira).
  const vale = taxaDoCreditoNaBandeira(taxas, ehBandeira(bandeira) ? porBandeira[bandeira] : undefined, vezes)
  const rotulo = vezes === 1 ? 'à vista' : `${vezes}x`
  if (vale.cadastrada) {
    if (!total || total <= 0 || !mostra) return null
    // A40 da 8ª: o líquido e a taxa só apareciam no Financeiro.
    const conta = liquidoNaMaquininha(total, vale.taxa)
    return (
      <p data-liquido-do-cartao role="note" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Taxa da maquininha no crédito {rotulo}: {vale.taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% ({formatBRL(conta.taxa)}) — a clínica recebe {formatBRL(conta.liquido)}
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
        Não há taxa da maquininha cadastrada para o crédito {rotulo}: a venda sai sem desconto da operadora (0%), também na comissão.
        {' '}Cadastre em Configurações → Comissões.
      </span>
    </p>
  )
}

/**
 * A taxa do DÉBITO que vai valer (A34 da 9ª simulação; princípio 3): com a
 * bandeira "Não informada", vale a regra geral — e a tela não dizia qual. Diz a
 * taxa (a da bandeira escolhida, se ela tiver a sua; senão a geral), o valor e
 * o líquido; sem nenhuma cadastrada, que sai sem desconto (0%, F16-2). A conta
 * é a de `private.comissao_taxa_pct` com a bandeira, como no crédito.
 */
export function AvisoDaTaxaDoDebito({ bandeira, total }: { bandeira?: string; total?: number }) {
  const [geral, setGeral] = useState<number | null | undefined>(undefined)
  const [porBandeira, setPorBandeira] = useState<CartaoPorBandeira>({})
  const [mostra, setMostra] = useState(false)
  useEffect(() => {
    let vivo = true
    Promise.all([taxaDoDebito(), cartaoPorBandeiraDaRede(), mostraOLiquidoDaMaquininha()])
      .then(([t, b, m]) => { if (vivo) { setGeral(t); setPorBandeira(b); setMostra(m) } })
      .catch(e => console.error('[pagamento] taxa do débito:', e))
    return () => { vivo = false }
  }, [])
  if (geral === undefined) return null
  const daBandeira = ehBandeira(bandeira) ? porBandeira[bandeira]?.taxas['DEBIT_CARD:1'] : undefined
  const taxa = typeof daBandeira === 'number' ? daBandeira : geral
  const deOnde = typeof daBandeira === 'number' ? 'a da bandeira' : ehBandeira(bandeira) ? 'a regra geral (a bandeira não tem taxa própria)' : 'a regra geral (bandeira não informada)'
  if (taxa == null) {
    return (
      <p data-taxa-do-debito role="note" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Não há taxa da maquininha cadastrada para o débito: a venda sai sem desconto da operadora (0%). Cadastre em Configurações → Comissões.
      </p>
    )
  }
  // A19 da 12ª: a taxa e o líquido só a quem vê o financeiro da clínica.
  if (!mostra) return null
  const conta = total && total > 0 ? liquidoNaMaquininha(total, taxa) : null
  return (
    <p data-taxa-do-debito role="note" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
      Taxa da maquininha no débito: {taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% — {deOnde}
      {conta ? ` (${formatBRL(conta.taxa)}); a clínica recebe ${formatBRL(conta.liquido)}` : ''}.
    </p>
  )
}
