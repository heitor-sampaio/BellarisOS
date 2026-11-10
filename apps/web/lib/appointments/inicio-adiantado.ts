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
const diaMes = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
/** O dia de Brasília ("AAAA-MM-DD"). */
const diaDe = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
/** Quantos dias do calendário de Brasília de `de` até `ate` (0 = o mesmo dia). */
function diasEntre(de: Date, ate: Date): number {
  const a = Date.parse(`${diaDe(de)}T12:00:00Z`), b = Date.parse(`${diaDe(ate)}T12:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/** A pergunta, quando o início é antes do horário; nulo quando pode iniciar sem perguntar. */
export function perguntaDoInicioAdiantado(marcadoPara: string | Date | null | undefined, agora: Date = new Date()): string | null {
  if (!marcadoPara) return null
  const quando = new Date(marcadoPara)
  if (Number.isNaN(quando.getTime())) return null
  const faltamMs = quando.getTime() - agora.getTime()
  if (faltamMs <= 0) return null
  // Em OUTRO dia (A24 da 9ª simulação, 2026-11-07): a pergunta era a mesma com
  // 19 minutos e com 15 dias de antecedência ("faltam 369 h 30 min"), e o
  // retorno de 22/11 foi concluído em 07/11. Diz os dias, a data e o que o
  // início faz — fica registrado como feito hoje.
  const dias = diasEntre(agora, quando)
  if (dias > 0) {
    return `O atendimento está marcado para ${diaMes(quando)} às ${hora(quando)} — ${dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`}, não é hoje. `
      + `Iniciar agora registra o atendimento como feito hoje, ${diaMes(agora)}: confira se é este o agendamento da cliente. Iniciar mesmo assim?`
  }
  const faltam = Math.round(faltamMs / 60_000)
  const tempo = faltam < 1 ? 'menos de 1 min'
    : faltam >= 60 ? `${Math.floor(faltam / 60)} h${faltam % 60 ? ` ${faltam % 60} min` : ''}`
    : `${faltam} min`
  return `O atendimento está marcado para as ${hora(quando)} — faltam ${tempo}. Iniciar mesmo assim?`
}

/**
 * O ATRASO do início (A25 da 11ª simulação, 2026-11-10: a Elaine iniciou 57 min
 * depois do horário, e nada dizia — antes da hora, a tela pergunta). Não
 * pergunta (atrasar não é engano de agendamento); a tela do atendimento DIZ:
 * "57 min depois do horário marcado (10:00)". Até 5 min é a hora (a régua da
 * tela, não uma regra de negócio).
 */
export const TOLERANCIA_DO_ATRASO_MIN = 5
export function atrasoDoInicio(marcadoPara: string | Date | null | undefined, inicio: string | Date | null | undefined): string | null {
  if (!marcadoPara || !inicio) return null
  const quando = new Date(marcadoPara), comecou = new Date(inicio)
  if (Number.isNaN(quando.getTime()) || Number.isNaN(comecou.getTime())) return null
  const atraso = Math.round((comecou.getTime() - quando.getTime()) / 60_000)
  if (atraso <= TOLERANCIA_DO_ATRASO_MIN) return null
  const tempo = atraso >= 60 ? `${Math.floor(atraso / 60)} h${atraso % 60 ? ` ${atraso % 60} min` : ''}` : `${atraso} min`
  return `${tempo} depois do horário marcado (${hora(quando)})`
}
