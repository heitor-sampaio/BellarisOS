'use client'

import { useEffect, useRef } from 'react'

/**
 * Leva à vista o item aberto (`[aria-current="page"]`) de uma linha que rola de
 * lado — as abas de Configurações no celular (A2 da 39ª). Mora DENTRO da linha
 * (um `span` escondido) e rola só ela, de lado: a página não se mexe.
 */
export function AtivoAVista() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const linha = ref.current?.parentElement
    const ativo = linha?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!linha || !ativo || linha.scrollWidth <= linha.clientWidth) return
    const a = ativo.getBoundingClientRect()
    const l = linha.getBoundingClientRect()
    if (a.left >= l.left && a.right <= l.right) return
    linha.scrollLeft += a.left - l.left - (l.width - a.width) / 2
  })
  return <span ref={ref} hidden aria-hidden />
}
