'use client'

import { useEffect, useState } from 'react'
import { maximoDeVezesNoCartao, maximoDeParcelasNoCrediario } from '@/actions/comissoes'
import { opcoesDeVezes } from '@/lib/financeiro/vezes-do-cartao'
import { opcoesDeParcelas, CREDIARIO_PADRAO } from '@/lib/financeiro/parcelas-do-crediario'

/**
 * As opções do "Vezes no cartão" da rede (D-15): de à vista ao limite que a
 * clínica configurou (ou, sem ele, a maior parcela do crédito com taxa).
 *
 * Enquanto o limite não chega, só "À vista" — oferecer 12x e encolher depois
 * deixaria escolher o que o servidor recusa. Uma leitura por tela.
 */
export function useOpcoesDeVezes(): number[] {
  const [maximo, setMaximo] = useState(1)
  useEffect(() => {
    let vivo = true
    maximoDeVezesNoCartao()
      .then(n => { if (vivo) setMaximo(n) })
      .catch(e => console.error('[pagamento] limite de vezes no crédito:', e))
    return () => { vivo = false }
  }, [])
  return opcoesDeVezes(maximo)
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
