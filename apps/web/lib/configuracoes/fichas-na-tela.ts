/**
 * Configurações → Fichas: o que fica na tela enquanto um editor está aberto
 * (A2 da 34ª simulação, princípio 7). Montando a ficha de atendimento nova, a
 * ficha de saúde inteira ficava em cima do editor; editando a ficha de saúde,
 * a lista das fichas de atendimento ficava embaixo. Um editor por vez: o
 * outro bloco volta quando o editor fecha. Puro, para a tela e o teste.
 */
export type EditorDaAbaDeFichas = 'saude' | 'atendimento' | null

export function blocosDaAbaDeFichas(aberto: EditorDaAbaDeFichas): { saude: boolean; atendimento: boolean } {
  return { saude: aberto !== 'atendimento', atendimento: aberto !== 'saude' }
}
