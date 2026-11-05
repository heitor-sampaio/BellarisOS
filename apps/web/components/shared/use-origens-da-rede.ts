'use client'

import { useEffect, useState } from 'react'
import { listarOrigensDoLead } from '@/actions/crm-origens'

/**
 * As origens do lead da clínica (A14 da 7ª simulação), para o modal do lead e
 * o painel do inbox. Nulo enquanto carrega; vazio se a leitura falha (a tela
 * segue com a origem que o lead já tem). `ativo` adia a ida ao servidor até o
 * modal abrir — o quadro monta um modal por card.
 */
export function useOrigensDaRede(ativo = true): string[] | null {
  const [origens, setOrigens] = useState<string[] | null>(null)
  useEffect(() => {
    if (!ativo || origens) return
    let vivo = true
    listarOrigensDoLead().then(o => { if (vivo) setOrigens(o) }).catch(() => { if (vivo) setOrigens([]) })
    return () => { vivo = false }
  }, [ativo, origens])
  return origens
}
