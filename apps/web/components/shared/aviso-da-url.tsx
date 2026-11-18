'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import { textoDoAviso } from '@/lib/aviso-da-url'

/**
 * Mostra o aviso que um redirecionamento do servidor deixou na URL
 * (`?aviso=`, `lib/aviso-da-url.ts` — J-29) e o tira dela: recarregar a tela
 * não o repete.
 *
 * A23 da 15ª = A14 da 18ª = A17 da 19ª (2026-11-17): era um toast no alto, por
 * cima da busca, que sumia sozinho antes de ser lido. Agora é uma faixa no
 * topo da tela, dentro do conteúdo (abaixo da topbar), que fica até a pessoa
 * fechar — ou ir para outra tela.
 */
export function AvisoDaUrl() {
  const chave = useSearchParams().get('aviso')
  const caminho = usePathname()
  const [aviso, setAviso] = useState<{ texto: string; caminho: string } | null>(null)
  // A chave nova (o redirecionamento que acabou de chegar) vira a faixa —
  // ajustado durante o render, comparando com a chave anterior.
  const [chaveAnterior, setChaveAnterior] = useState<string | null>(null)
  if (chave !== chaveAnterior) {
    setChaveAnterior(chave)
    const texto = textoDoAviso(chave)
    if (texto) setAviso({ texto, caminho })
  }

  useEffect(() => {
    if (!chave) return
    const url = new URL(window.location.href)
    url.searchParams.delete('aviso')
    window.history.replaceState(null, '', url)
  }, [chave])

  if (!aviso || aviso.caminho !== caminho) return null
  return (
    <div data-aviso-da-url role="status" className="aviso-da-url">
      <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{aviso.texto}</span>
      <button type="button" className="aviso-da-url-fechar" aria-label="Fechar o aviso" onClick={() => setAviso(null)}>
        <X size={14} />
      </button>
    </div>
  )
}
