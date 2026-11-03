/**
 * Iniciar o atendimento ANTES do horário (A32 da 5ª simulação): a Tatiane
 * iniciou às 11:07 o das 13:00, e o Paulo às 11:08 o das 12:45, sem aviso
 * nenhum. Antes do horário marcado — em QUALQUER quantidade de tempo
 * (r2-age-06, o Heitor em 2026-11-03: "confirma iniciar mesmo assim em
 * qualquer período de tempo anterior ao horário marcado"; até ali só a partir
 * de 30 min) —, o início pede confirmação, e o servidor só inicia com ela (os
 * três caminhos: o "Iniciar atendimento", o status pela janela e o "Marcar
 * chegada e iniciar"). Na hora marcada ou depois, inicia direto. A regra é
 * esta, pura: a tela e o servidor dividem.
 */

const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** A pergunta, quando o início é antes do horário; nulo quando pode iniciar sem perguntar. */
export function perguntaDoInicioAdiantado(marcadoPara: string | Date | null | undefined, agora: Date = new Date()): string | null {
  if (!marcadoPara) return null
  const quando = new Date(marcadoPara)
  if (Number.isNaN(quando.getTime())) return null
  const faltamMs = quando.getTime() - agora.getTime()
  if (faltamMs <= 0) return null
  const faltam = Math.round(faltamMs / 60_000)
  const tempo = faltam < 1 ? 'menos de 1 min'
    : faltam >= 60 ? `${Math.floor(faltam / 60)} h${faltam % 60 ? ` ${faltam % 60} min` : ''}`
    : `${faltam} min`
  return `O atendimento está marcado para as ${hora(quando)} — faltam ${tempo}. Iniciar mesmo assim?`
}
