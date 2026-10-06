'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { rotaComParams } from '@estetica-os/nucleo/lib/query-params'

/**
 * Um `.filtro-select` cujo valor mora na URL (lista montada no SERVIDOR). Mais
 * de cinco opções, então não é segmentado (§13).
 */
export function FiltroNaUrl({ nome, valor, opcoes, rotulo }: {
  nome: string; valor: string; opcoes: { valor: string; rotulo: string }[]; rotulo: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return (
    <select className="filtro-select" aria-label={rotulo} value={valor}
      onChange={e => router.replace(rotaComParams(pathname, params, { [nome]: e.target.value || null }), { scroll: false })}>
      {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
    </select>
  )
}
