'use client'

import { useEffect, useState } from 'react'
import { maquininhasParaAVenda, type MaquininhaNaVenda } from '@/actions/maquininhas'

/**
 * As maquininhas ativas da rede, para quem recebe no cartão (C75). Uma leitura
 * para todos os campos da mesma tela (o "Qual maquininha?", o aviso da taxa e
 * as "Vezes no cartão" pedem juntos): a promessa fica guardada alguns segundos.
 */
type Leitura = { lista: MaquininhaNaVenda[]; mostra: boolean }
let emCurso: { quando: number; promessa: Promise<Leitura> } | null = null

function lerAsMaquininhas(): Promise<Leitura> {
  const agora = Date.now()
  if (emCurso && agora - emCurso.quando < 5_000) return emCurso.promessa
  const promessa = maquininhasParaAVenda()
  emCurso = { quando: agora, promessa }
  promessa.catch(() => { emCurso = null })
  return promessa
}

export function useMaquininhas(): Leitura | null {
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  useEffect(() => {
    let vivo = true
    lerAsMaquininhas()
      .then(l => { if (vivo) setLeitura(l) })
      .catch(e => console.error('[pagamento] maquininhas da rede:', e))
    return () => { vivo = false }
  }, [])
  return leitura
}

/** A maquininha que vale: a escolhida, senão a primeira (a que o banco põe sem escolha). */
export function maquininhaEscolhida(lista: MaquininhaNaVenda[] | undefined, id: string | null | undefined): MaquininhaNaVenda | null {
  if (!lista?.length) return null
  return (id && lista.find(m => m.id === id)) || lista[0]!
}
