/**
 * Onde o botão flutuante do Copilot sobe, para não cobrir o botão da tela:
 * - no inbox, sempre ("sim"): embaixo, à direita, mora o "Enviar" da conversa;
 * - na tela do atendimento, só no celular ("celular"): ali a ação principal
 *   (Finalizar, Iniciar…) vira a barra do rodapé (D1 da 10ª simulação).
 */
export function subidaDoBotaoDoCopilot(pathname: string): 'sim' | 'celular' | 'nao' {
  if (/\/inbox(\/|$)/.test(pathname)) return 'sim'
  if (/\/agenda\/[0-9a-f-]{36}\/?$/i.test(pathname)) return 'celular'
  return 'nao'
}
