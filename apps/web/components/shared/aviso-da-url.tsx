'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import { textoDoAviso } from '@/lib/aviso-da-url'

/**
 * D5 da 30ª: as unidades desativadas da rede (o endereço → o nome), lidas pelo
 * layout no servidor. O `?desativada=<slug>` do redirecionamento só escolhe
 * ENTRE elas: o nome nunca sai do texto da URL.
 */
const UnidadesDesativadas = createContext<Readonly<Record<string, string>>>({})

export function UnidadesDesativadasProvider({ nomes, children }: { nomes: Readonly<Record<string, string>>; children: ReactNode }) {
  return <UnidadesDesativadas.Provider value={nomes}>{children}</UnidadesDesativadas.Provider>
}

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
  const busca = useSearchParams()
  const chave = busca.get('aviso')
  const desativada = busca.get('desativada')
  const desativadas = useContext(UnidadesDesativadas)
  const caminho = usePathname()
  const [aviso, setAviso] = useState<{ texto: string; caminho: string } | null>(null)
  // A chave nova (o redirecionamento que acabou de chegar) vira a faixa —
  // ajustado durante o render, comparando com a chave anterior.
  const [chaveAnterior, setChaveAnterior] = useState<string | null>(null)
  if (chave !== chaveAnterior) {
    setChaveAnterior(chave)
    const texto = textoDoAviso(chave, desativada && Object.hasOwn(desativadas, desativada) ? desativadas[desativada] : null)
    if (texto) setAviso({ texto, caminho })
  }

  useEffect(() => {
    if (!chave) return
    const url = new URL(window.location.href)
    url.searchParams.delete('aviso')
    url.searchParams.delete('desativada')
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
