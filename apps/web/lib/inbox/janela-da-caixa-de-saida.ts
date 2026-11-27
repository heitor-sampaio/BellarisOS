import { estadoDaJanela } from '@/lib/channels/window'
import type { ChannelKind } from '@/lib/channels/types'

/**
 * A pessoa responde pelo número DELA, e o cliente nunca falou com ele nesta
 * conversa: a janela de 24 h desse número está fechada — se ele tiver janela.
 * Só a API oficial (a Cloud API) tem (WT-12: "a janela de 24 h (que só o
 * oficial tem)"); no WhatsApp Web o texto sai (D5 da 38ª: o aviso e o bloqueio
 * apareciam numa caixa do WhatsApp Web).
 *
 * É a mesma régua do servidor (`estadoDaJanela` com o provedor da caixa que
 * vai enviar, `lib/inbox/enviar.ts`), sem mensagem do contato naquela caixa.
 * `caixaDeSaida` nulo: a resposta sai pela caixa da conversa, e a janela é a
 * dela (`estadoDaJanela` da conversa, na tela).
 */
export function janelaFechadaNaCaixaDeSaida(
  canal: ChannelKind,
  caixaDeSaida: { provider: string } | null,
): boolean {
  if (!caixaDeSaida) return false
  return !estadoDaJanela(canal, null, caixaDeSaida.provider).aberta
}
