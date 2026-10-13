'use client'

import { useEffect, useState } from 'react'
import { listarTagsAtivas } from '@/actions/tags'

/**
 * As tags ATIVAS da rede (Configurações → Tags), para as telas que as
 * oferecem: ficha, cadastro, card da oportunidade, campanha. \`ativo\` falso
 * adia a leitura (o quadro monta um modal por card: só lê quem abriu).
 * Até chegar, \`null\`.
 */
export function useTagsDaRede(ativo = true): string[] | null {
  const [tags, setTags] = useState<string[] | null>(null)
  useEffect(() => {
    if (!ativo || tags) return
    let vivo = true
    listarTagsAtivas().then(t => { if (vivo) setTags(t) }).catch(() => { if (vivo) setTags([]) })
    return () => { vivo = false }
  }, [ativo, tags])
  return tags
}
