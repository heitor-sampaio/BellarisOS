/**
 * Iniciar o atendimento MUITO antes do horário (A32 da 5ª simulação): a
 * Tatiane iniciou às 11:07 o das 13:00, e o Paulo às 11:08 o das 12:45, sem
 * aviso nenhum. Mais de 30 minutos antes do horário marcado, o início pede
 * confirmação — e o servidor só inicia com ela (os três caminhos: o
 * "Iniciar atendimento", o status pela janela e o "Marcar chegada e
 * iniciar"). A regra é esta, pura: a tela e o servidor dividem.
 */

export const ANTECEDENCIA_SEM_PERGUNTAR_MIN = 30

const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** A pergunta, quando o início é adiantado demais; nulo quando pode iniciar sem perguntar. */
export function perguntaDoInicioAdiantado(marcadoPara: string | Date | null | undefined, agora: Date = new Date()): string | null {
  if (!marcadoPara) return null
  const quando = new Date(marcadoPara)
  if (Number.isNaN(quando.getTime())) return null
  const faltam = Math.round((quando.getTime() - agora.getTime()) / 60_000)
  if (faltam <= ANTECEDENCIA_SEM_PERGUNTAR_MIN) return null
  const tempo = faltam >= 60
    ? `${Math.floor(faltam / 60)} h${faltam % 60 ? ` ${faltam % 60} min` : ''}`
    : `${faltam} min`
  return `O atendimento está marcado para as ${hora(quando)} — faltam ${tempo}. Iniciar mesmo assim?`
}
