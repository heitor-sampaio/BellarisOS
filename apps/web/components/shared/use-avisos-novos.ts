'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useSinais } from '@/components/shared/realtime-refresher'

/**
 * O sino: o aviso novo chega pelo SINAL `avisos` (o da pessoa, sem conteúdo —
 * o Heitor, 19/11, "vai na 2") e a lista vem do servidor (`buscar`, a action
 * do sino). O que não estava na lista da montagem é novo: `aoChegar` recebe
 * cada um, do mais antigo para o mais novo, uma vez só.
 */
export function useAvisosNovos<T extends { id: string }>(
  buscar: () => Promise<{ notifications: T[] }>,
  aoChegar: (n: T) => void,
) {
  const vistos = useRef<Set<string> | null>(null)
  const refChegar = useRef(aoChegar)
  useEffect(() => { refChegar.current = aoChegar }, [aoChegar])
  const refBuscar = useRef(buscar)
  useEffect(() => { refBuscar.current = buscar }, [buscar])

  // Os que já existiam na montagem não são "novos".
  useEffect(() => {
    let vivo = true
    refBuscar.current().then(r => {
      if (vivo && !vistos.current) vistos.current = new Set(r.notifications.map(n => n.id))
    }).catch(() => { /* o sino segue com o que tem */ })
    return () => { vivo = false }
  }, [])

  const aoSinal = useCallback(() => {
    refBuscar.current().then(r => {
      const ja = vistos.current ?? new Set<string>()
      const novos = r.notifications.filter(n => !ja.has(n.id)).reverse()
      for (const n of r.notifications) ja.add(n.id)
      vistos.current = ja
      for (const n of novos) refChegar.current(n)
    }).catch(() => { /* o próximo sinal tenta de novo */ })
  }, [])

  useSinais(['avisos'], aoSinal)
}
