'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { rotaComParams } from '@/lib/query-params'

/**
 * Campo de busca de uma lista montada no SERVIDOR: o termo mora no `?q=` da
 * URL, e a página filtra por ele. É o que deixa a busca universal abrir a tela
 * já filtrada (`…/procedures?q=botox`) e o link continuar valendo.
 *
 * Lista montada no navegador não precisa disto — basta o estado local começar
 * pelo `?q=`.
 */
export function BuscaNaUrl({
  inicial, placeholder, rotulo,
}: {
  inicial:     string
  placeholder: string
  rotulo:      string
}) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()
  const [termo, setTermo] = useState(inicial)
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A busca universal pode trocar o `?q=` com a tela aberta.
  const [inicialVisto, setInicialVisto] = useState(inicial)
  if (inicial !== inicialVisto) {
    setInicialVisto(inicial)
    setTermo(inicial)
  }

  useEffect(() => () => clearTimeout(espera.current), [])

  function mudar(valor: string) {
    setTermo(valor)
    clearTimeout(espera.current)
    espera.current = setTimeout(() => {
      router.replace(rotaComParams(pathname, params, { q: valor.trim() || null }), { scroll: false })
    }, 300)
  }

  return (
    <div className="filtro-largo" style={{ position: 'relative', flex: '1 1 220px', minWidth: 180, maxWidth: 360 }}>
      <Search
        size={14}
        aria-hidden
        style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-faint)', pointerEvents: 'none',
        }}
      />
      <input
        type="search"
        value={termo}
        onChange={e => mudar(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        className="field campo-busca"
        style={{ paddingLeft: 32 }}
      />
    </div>
  )
}
