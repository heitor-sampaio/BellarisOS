'use client'

import { useEffect } from 'react'

/**
 * O que ganha o foco atrás do botão flutuante do Copilot sobe acima dele (A16
 * da 23ª simulação: a 1440×900 ele cobria o "Confirmar estorno" da comissão,
 * aberto no meio da página — o espaço no fim do `main` só resolve o FIM).
 *
 * A conta é pura: quanto rolar para o fim do alvo ficar acima do botão, com
 * folga — nunca a ponto de o topo do alvo ir para trás da topbar.
 */

interface Caixa { top: number; bottom: number; left: number; right: number }

const FOLGA = 12

export function quantoRolarAcimaDoBotao(alvo: Caixa, botao: Caixa, topoLivre: number): number {
  const naColuna = alvo.right > botao.left && alvo.left < botao.right
  if (!naColuna || alvo.bottom <= botao.top - FOLGA || alvo.top >= botao.bottom) return 0
  const falta = alvo.bottom - botao.top + FOLGA
  const cabe = alvo.top - topoLivre - FOLGA
  return Math.max(0, Math.min(falta, cabe))
}

/**
 * O que se confere: a linha de ação em que o foco caiu (o grupo, o formulário
 * pequeno), senão o próprio campo. Grupo mais alto que a janela fica de fora.
 */
function alvoDoFoco(el: HTMLElement): HTMLElement {
  const grupo = el.closest<HTMLElement>('[role="group"], form')
  if (grupo && grupo.getBoundingClientRect().height < window.innerHeight / 2) return grupo
  return el
}

/** Liga a conta acima ao foco da página, enquanto o botão está na tela. */
export function useFocoAcimaDoBotao() {
  useEffect(() => {
    function aoFocar(e: FocusEvent) {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      // O painel do Copilot e o modal (camada de cima) não ficam atrás do botão.
      if (el.closest('.copilot-painel, .copilot-botao, dialog[open]')) return
      const botao = document.querySelector<HTMLElement>('.copilot-botao')
      if (!botao) return
      // A topbar é fixa: a altura dela é o token do layout.
      const topoLivre = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 0
      const rolar = quantoRolarAcimaDoBotao(alvoDoFoco(el).getBoundingClientRect(), botao.getBoundingClientRect(), topoLivre)
      if (rolar > 0) window.scrollBy({ top: rolar, behavior: 'smooth' })
    }
    document.addEventListener('focusin', aoFocar)
    return () => document.removeEventListener('focusin', aoFocar)
  }, [])
}
