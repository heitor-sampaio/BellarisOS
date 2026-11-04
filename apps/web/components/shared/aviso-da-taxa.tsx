'use client'

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { taxasDoCartaoDeCredito, cartaoPorBandeiraDaRede } from '@/actions/comissoes'
import { ehBandeira, taxaDoCreditoNaBandeira, type CartaoPorBandeira } from '@/lib/financeiro/bandeiras'

/**
 * O aviso de quem recebe no cartão de crédito em N vezes sem a taxa da
 * maquininha de N vezes cadastrada (A33 da simulação de 2026-10-27): a
 * comissão então usa a da maior parcela cadastrada abaixo dela, ou nenhuma, e
 * a tela não dizia. As taxas se cadastram em Configurações → Comissões (1x a
 * 12x). Só aparece no crédito; a conta é `taxaDoCreditoNaBandeira` (o espelho da do banco).
 */
export function AvisoDaTaxa({ vezes, bandeira }: { vezes: number; bandeira?: string }) {
  const [taxas, setTaxas] = useState<{ parcelas: number; taxa_pct: number }[] | null>(null)
  const [porBandeira, setPorBandeira] = useState<CartaoPorBandeira>({})
  useEffect(() => {
    let vivo = true
    Promise.all([taxasDoCartaoDeCredito(), cartaoPorBandeiraDaRede()])
      .then(([t, b]) => { if (vivo) { setTaxas(t); setPorBandeira(b) } })
      // Só um aviso: sem ele a tela segue, e o motivo vai ao console.
      .catch(e => console.error('[pagamento] taxas do cartão:', e))
    return () => { vivo = false }
  }, [])
  if (!taxas) return null
  // r4-f15-01: a bandeira vale com a taxa EXATA destas vezes; senão, a regra
  // geral destas vezes (a conta de private.comissao_taxa_pct com a bandeira).
  const vale = taxaDoCreditoNaBandeira(taxas, ehBandeira(bandeira) ? porBandeira[bandeira] : undefined, vezes)
  if (vale.cadastrada) return null
  const rotulo = vezes === 1 ? 'à vista' : `${vezes}x`
  const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  return (
    <p data-aviso-taxa role="note" style={{
      display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45,
    }}>
      <Info size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} aria-hidden />
      <span>
        Não há taxa da maquininha cadastrada para o crédito {rotulo}
        {vale.parcelas ? ` — a comissão usa a de ${vale.parcelas === 1 ? 'à vista' : `${vale.parcelas}x`} (${pct(vale.taxa)})` : ' — a comissão não desconta taxa'}.
        {' '}Cadastre em Configurações → Comissões.
      </span>
    </p>
  )
}
