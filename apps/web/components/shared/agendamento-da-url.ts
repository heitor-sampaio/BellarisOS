'use client'

import { useEffect, useEffectEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * O agendamento pedido PELA URL (`?agendamento=<id>`) — a porta da busca
 * universal para quem tem a Agenda sem o Atendimento (D5 da 29ª): a agenda abre
 * no dia dele (`?date=`) e com ele aberto. Como o `?novo=1`
 * (`useNovoAgendamentoDaUrl`): abre e tira o parâmetro da URL, e recarregar a
 * página não o reabre. O id que a agenda não tem (de outra unidade, fora da
 * janela) não abre nada — a agenda só mostra o que o servidor trouxe.
 */
export function agendamentoDaUrl<T extends { id: string }>(id: string | null, lista: readonly T[]): T | null {
  if (!id) return null
  return lista.find(a => a.id === id) ?? null
}

/** A busca sem o `agendamento` — o dia, a unidade e os filtros ficam. */
export function semOAgendamento(busca: string): string {
  const q = new URLSearchParams(busca)
  q.delete('agendamento')
  return q.toString()
}

export function useAgendamentoDaUrl<T extends { id: string }>(lista: readonly T[], abrir: (a: T) => void): void {
  const params   = useSearchParams()
  const router   = useRouter()
  const pathname = usePathname()
  const id       = params.get('agendamento')

  const aoPedir = useEffectEvent(() => {
    const achado = agendamentoDaUrl(id, lista)
    if (achado) abrir(achado)
    // `window.location.search`: o dia aberto pode ter ido à URL por `replaceState`.
    const resto = semOAgendamento(window.location.search)
    router.replace(resto ? `${pathname}?${resto}` : pathname, { scroll: false })
  })
  useEffect(() => { if (id) aoPedir() }, [id])
}
