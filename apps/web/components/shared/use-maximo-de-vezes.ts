'use client'

import { useEffect, useState } from 'react'
import { maximoDeParcelasNoCrediario } from '@/actions/comissoes'
import { opcoesDeVezes, TETO_DE_VEZES } from '@/lib/financeiro/vezes-do-cartao'
import { useMaquininhas, maquininhaEscolhida } from '@/components/shared/use-maquininhas'
import { opcoesDeParcelas, CREDIARIO_PADRAO } from '@/lib/financeiro/parcelas-do-crediario'

/**
 * As opções do "Vezes no cartão" (D-15) na MAQUININHA da venda (C75): de à
 * vista ao "Parcelar até" dela (ou, sem ele, a maior parcela do crédito com
 * taxa). Sem maquininha escolhida, a primeira (a que o banco põe).
 *
 * Enquanto as maquininhas não chegam, só "À vista" — oferecer 12x e encolher
 * depois deixaria escolher o que o servidor recusa.
 */
export function useOpcoesDeVezes(maquininha?: string | null): number[] {
  const leitura = useMaquininhas()
  const m = maquininhaEscolhida(leitura?.lista, maquininha)
  return opcoesDeVezes(leitura ? (m?.maximo ?? TETO_DE_VEZES) : 1)
}

/**
 * As opções das "Parcelas do saldo" do crediário (C38): de 1x ao limite que a
 * clínica configurou (padrão 12). Enquanto o limite não chega, o padrão.
 */
export function useOpcoesDeParcelas(): number[] {
  const [maximo, setMaximo] = useState(CREDIARIO_PADRAO)
  useEffect(() => {
    let vivo = true
    maximoDeParcelasNoCrediario()
      .then(n => { if (vivo) setMaximo(n) })
      .catch(e => console.error('[pagamento] limite de parcelas do crediário:', e))
    return () => { vivo = false }
  }, [])
  return opcoesDeParcelas(maximo)
}
