'use client'

import { useEffect, useState } from 'react'
import { listarTagsAtivas, listarTagsDoFiltro } from '@/actions/tags'

/**
 * As tags da rede (Configurações → Tags), para as telas que as oferecem. Para
 * MARCAR (ficha, cadastro, card da oportunidade), só as ATIVAS (TG-08); para
 * FILTRAR (`'filtro'`: o público da campanha), também as arquivadas que alguém
 * ainda tem, como as outras telas que filtram (TG-14). \`ativo\` falso adia a
 * leitura (o quadro monta um modal por card: só lê quem abriu). Até chegar,
 * \`null\`.
 */
export function useTagsDaRede(ativo = true, para: 'marcar' | 'filtro' = 'marcar'): string[] | null {
  const [tags, setTags] = useState<string[] | null>(null)
  useEffect(() => {
    if (!ativo || tags) return
    let vivo = true
    const ler = para === 'filtro' ? listarTagsDoFiltro : listarTagsAtivas
    ler().then(t => { if (vivo) setTags(t) }).catch(() => { if (vivo) setTags([]) })
    return () => { vivo = false }
  }, [ativo, tags, para])
  return tags
}
