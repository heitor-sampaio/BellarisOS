/**
 * O que a tela e o servidor do Copilot dividem — sem nada de servidor aqui
 * (o painel importa este arquivo).
 */

/** Uma linha do resumo de uma gravação ("Cliente: Maria Souza"). */
export interface LinhaDoResumo { rotulo: string; valor: string }

/** O que o cartão de confirmação mostra antes de gravar. */
export interface ResumoDaAcao {
  titulo: string
  linhas: LinhaDoResumo[]
  /** Aviso a mais ("o cliente recebe a confirmação pelo WhatsApp"). */
  aviso?: string
}

export type StatusDaAcao = 'pendente' | 'executando' | 'feita' | 'cancelada' | 'falhou' | 'vencida'

export interface ResultadoDaAcao { mensagem: string; href?: string; rotuloDoLink?: string }

export type Cartao =
  | { tipo: 'acao'; acaoId: string; resumo: ResumoDaAcao; status: StatusDaAcao; resultado?: ResultadoDaAcao | null }
  | { tipo: 'links'; titulo?: string; itens: { texto: string; detalhe?: string; href?: string }[] }

export interface AnexoNaTela { nome: string; tipo: 'imagem' | 'audio' | 'documento' }

export interface MensagemNaTela {
  id: string
  papel: 'user' | 'assistant'
  texto: string
  anexos?: AnexoNaTela[]
  cartoes?: Cartao[]
  criadaEm: string
}

export interface ConversaNaLista { id: string; titulo: string; atualizadaEm: string }

/** Os eventos do stream de `POST /api/copilot` (uma linha `data:` cada). */
export type EventoDoCopilot =
  | { tipo: 'conversa'; id: string; titulo: string }
  | { tipo: 'transcricao'; texto: string }
  | { tipo: 'texto'; delta: string }
  | { tipo: 'pensando'; rotulo: string }
  | { tipo: 'cartao'; cartao: Cartao }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'fim' }

/** Limites do que a pessoa manda. */
export const TEXTO_MAXIMO = 4000
export const ANEXOS_MAXIMOS = 4
