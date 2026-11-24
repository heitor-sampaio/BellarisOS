import { horaNoFuso } from '@/lib/datetime'
import { FUSO_PADRAO, fusoValido, nomeDoFuso } from '@/lib/unidades/fuso'

/**
 * A hora de uma unidade dita na tela de OUTRA (26ª simulação; F62 e princípio
 * 3). Puro: roda no servidor e no navegador.
 *
 * O agendamento de Cuiabá às 18:55 aparecia às 19:55 na agenda e no dashboard
 * do Setor Bueno, e às 18:55 na agenda de Cuiabá — a mesma consulta com duas
 * horas, sem dizer o relógio. Decisão do Claude (26ª, princípio 3): a hora de
 * um registro sai no relógio da unidade DELE (a que a agenda dela mostra) e,
 * quando não é o relógio da tela, diz qual é: "18:55 (horário de Cuiabá)". A
 * grade continua no relógio do portal — o cartão fica no instante certo, ao
 * lado do que ela tem aqui.
 */

/** O nome do relógio da unidade, quando não é o da tela; senão, nulo. */
export function relogioSeOutro(fusoDele: string | null | undefined, fusoDaTela: string | null | undefined): string | null {
  return fusoValido(fusoDele) === fusoValido(fusoDaTela) ? null : nomeDoFuso(fusoDele)
}

/** "HH:mm" no relógio da unidade do registro, e o relógio quando não é o da tela. */
export function horaNaUnidadeDele(
  instante: Date | string, fusoDele: string | null | undefined, fusoDaTela: string | null | undefined,
): { hora: string; relogio: string | null } {
  return { hora: horaNoFuso(instante, fusoValido(fusoDele)), relogio: relogioSeOutro(fusoDele, fusoDaTela) }
}

/** "18:55 (horário de Cuiabá)", ou só "18:55" no relógio da tela. */
export function comORelogio({ hora, relogio }: { hora: string; relogio: string | null }): string {
  return relogio ? `${hora} (${relogio})` : hora
}

/**
 * "Horário de Cuiabá" fora de Brasília; no de Brasília, nulo — a regra da
 * `NotaDoFuso` (o caso comum não ganha texto, princípio 7).
 */
export function relogioForaDeBrasilia(fuso: string | null | undefined): string | null {
  if (fusoValido(fuso) === FUSO_PADRAO) return null
  const nome = nomeDoFuso(fuso)
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/**
 * Em que relógio vale o horário próprio de quem atende (A11 da 26ª; princípio
 * 3). O horário é um só e vale "na parede" de cada unidade em que ela atende
 * (`intervalosDoDia` cruza os minutos do dia da unidade com os dela): 09:00 em
 * Cuiabá é 09:00 do horário de Cuiabá. Todas em Brasília (ou nenhuma), nada a
 * dizer; um relógio só, ele; vários, o de cada unidade.
 */
export function textoDoRelogioDoHorario(unidades: readonly { nome: string; fuso: string | null | undefined }[]): string | null {
  const fusos = new Set(unidades.map(u => fusoValido(u.fuso)))
  if (fusos.size === 0 || (fusos.size === 1 && fusos.has(FUSO_PADRAO))) return null
  if (fusos.size === 1) return `No ${nomeDoFuso([...fusos][0])}.`
  return `Vale no relógio de cada unidade: ${unidades.map(u => `${u.nome} no ${nomeDoFuso(u.fuso)}`).join(', ')}.`
}
