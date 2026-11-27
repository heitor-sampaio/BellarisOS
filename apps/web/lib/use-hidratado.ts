'use client'

import { useSyncExternalStore } from 'react'

const nadaParaOuvir = () => () => {}

/**
 * Falso no servidor e na hidratação; verdadeiro depois que o navegador hidratou
 * a tela. O botão que chega pronto do servidor não faz nada até a hidratação, e
 * o clique nesse meio se perde calado: quem desliga o botão até aqui faz a
 * pessoa (e o E2E) esperar o botão valer.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(nadaParaOuvir, () => true, () => false)
}
