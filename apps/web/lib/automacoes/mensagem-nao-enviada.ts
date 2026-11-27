import type { ContextoDaExecucao } from './contexto'

/**
 * A mensagem do passo que o provedor não aceitou, guardada no contexto da
 * execução (D2 da 38ª; crm-inbox:IN-18, princípio 3).
 *
 * A execução que falha volta pelo cron (até três tentativas). Sem isto, cada
 * tentativa gravava uma bolha "Não enviada" NOVA na conversa; com isto, a
 * tentativa seguinte reenvia a MESMA linha — como o "Tentar de novo" da bolha
 * (`reenviarNaConversa`). Fica no contexto porque é ele que a execução grava
 * ao falhar e relê ao voltar; e por passo (o id do nó), porque o fluxo pode
 * ter mais de um "Mandar mensagem". Puro: o motor e o teste importam.
 */

export interface MensagemNaoEnviada {
  /** A linha de `messages` que ficou "Não enviada". */
  mensagemId: string
  /** O número padrão pelo qual a conversa foi aberta nesta execução (AX-06), para a execução dizer. */
  abriuPeloPadrao?: string | null
}

const CHAVE = 'mensagensNaoEnviadas'

function doContexto(contexto: ContextoDaExecucao): Record<string, MensagemNaoEnviada> {
  const v = contexto[CHAVE]
  return v && typeof v === 'object' ? (v as Record<string, MensagemNaoEnviada>) : {}
}

export function naoEnviadaDoPasso(contexto: ContextoDaExecucao, noId: string): MensagemNaoEnviada | null {
  const m = doContexto(contexto)[noId]
  return m?.mensagemId ? m : null
}

export function guardarNaoEnviada(contexto: ContextoDaExecucao, noId: string, mensagem: MensagemNaoEnviada): void {
  contexto[CHAVE] = { ...doContexto(contexto), [noId]: mensagem }
}

export function esquecerNaoEnviada(contexto: ContextoDaExecucao, noId: string): void {
  const todas = doContexto(contexto)
  if (!(noId in todas)) return
  const resto = Object.fromEntries(Object.entries(todas).filter(([id]) => id !== noId))
  if (Object.keys(resto).length) contexto[CHAVE] = resto
  else delete contexto[CHAVE]
}
