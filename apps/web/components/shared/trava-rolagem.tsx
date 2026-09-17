'use client'

import { useEffect } from 'react'

/**
 * Trava a rolagem do documento enquanto a tela estiver montada.
 *
 * Existe para telas que JÁ ocupam exatamente a altura disponível e rolam por
 * dentro — o inbox é uma. Sem isto o documento continua rolável: o `<main>` do
 * layout tem `min-height` em `vh`, e no celular `100vh` é a viewport com a barra
 * de endereço recolhida, então sobra sempre uma faixa a mais. O resultado é a
 * página inteira deslizando junto com a conversa, levando cabeçalho e campo de
 * escrever embora.
 *
 * Remove ao desmontar, senão sair do inbox deixaria o resto do sistema travado.
 */
export function TravaRolagem() {
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('trava-rolagem')
    return () => { html.classList.remove('trava-rolagem') }
  }, [])

  return null
}
