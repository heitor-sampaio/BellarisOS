'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Os dois lados do movimento do site: o que revela e o que anda em sequência.
 * Quem liga e desliga é o script do <head> (`lib/movimento.ts`).
 */
const ligado = () => document.documentElement.classList.contains('site-movimento')

/**
 * Marca a página como viva e revela o que tem `data-revelar` quando chega na
 * tela (a classe `revelado`; a entrada é do CSS). Também passa a posição do
 * ponteiro aos cartões com `data-luz`, para o brilho que o segue.
 */
export function Movimento() {
  useEffect(() => {
    if (!ligado()) return
    document.documentElement.setAttribute('data-movimento', 'vivo')

    const io = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue
        e.target.classList.add('revelado')
        io.unobserve(e.target)
      }
    }, { rootMargin: '0px 0px -8% 0px' })
    document.querySelectorAll('[data-revelar]').forEach(el => io.observe(el))

    const luz = (ev: PointerEvent) => {
      const alvo = (ev.target as Element | null)?.closest?.('[data-luz]') as HTMLElement | null
      if (!alvo) return
      const r = alvo.getBoundingClientRect()
      alvo.style.setProperty('--luz-x', `${ev.clientX - r.left}px`)
      alvo.style.setProperty('--luz-y', `${ev.clientY - r.top}px`)
    }
    const comMouse = matchMedia('(pointer: fine)').matches
    if (comMouse) document.addEventListener('pointermove', luz, { passive: true })

    return () => {
      io.disconnect()
      if (comMouse) document.removeEventListener('pointermove', luz)
    }
  }, [])
  return null
}

/**
 * Anda por uma sequência de passos (uma duração em ms por passo) enquanto o
 * elemento está na tela e a aba está aberta; fora dela, para onde estava.
 * Sem movimento, fica no passo do servidor: o ÚLTIMO (a demonstração
 * inteira, `recomecar`) ou o primeiro. Com movimento, a demonstração volta ao
 * começo assim que monta — ainda longe da tela — e espera ser vista.
 */
export function useSequencia<T extends HTMLElement>(duracoes: readonly number[], recomecar = true) {
  const ref = useRef<T>(null)
  const [passo, setPasso] = useState(recomecar ? duracoes.length - 1 : 0)

  useEffect(() => {
    const el = ref.current
    if (!el || !ligado()) return
    let atual = 0
    // Num quadro, não no corpo do efeito: o React pede que o estado mude por evento.
    const volta = recomecar ? requestAnimationFrame(() => setPasso(0)) : 0
    let visivel = false
    let relogio: number | undefined

    const agenda = () => {
      window.clearTimeout(relogio)
      relogio = window.setTimeout(() => {
        atual = (atual + 1) % duracoes.length
        setPasso(atual)
        agenda()
      }, duracoes[atual])
    }
    const anda = () => {
      if (!visivel || document.hidden) { window.clearTimeout(relogio); return }
      agenda()
    }
    const io = new IntersectionObserver(([e]) => { visivel = !!e?.isIntersecting; anda() }, { threshold: 0.35 })
    io.observe(el)
    document.addEventListener('visibilitychange', anda)
    return () => {
      cancelAnimationFrame(volta)
      io.disconnect()
      window.clearTimeout(relogio)
      document.removeEventListener('visibilitychange', anda)
    }
  }, [duracoes, recomecar])

  return [ref, passo] as const
}
