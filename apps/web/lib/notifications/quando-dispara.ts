/**
 * Quando a campanha AUTOMÁTICA dispara — a regra do cron
 * (`app/api/cron/notification-campaigns`) e o texto que a revisão e os
 * detalhes mostram, num lugar só (D8 da 11ª simulação, 2026-11-10; princípio
 * 3: a "Reativação 60 dias" da Marta nasceu com o gatilho de aniversário, e a
 * tela não dizia quando ela sairia).
 *
 * Os gatilhos do DIA (aniversário, data comemorativa, depois da visita, antes
 * de o pacote vencer) saem a partir das 09:00 de Brasília — na primeira
 * passada do cron (de hora em hora) depois disso; até 2026-11-10 saíam logo
 * depois da meia-noite, e o aviso tocava o celular da cliente de madrugada
 * (a regra do lembrete do CRM, que só avisa a partir das 7h). O lembrete do
 * agendamento é de hora em hora, pela antecedência.
 */
export type GatilhoDaCampanha = 'BIRTHDAY' | 'ANNUAL_DATE' | 'DAYS_AFTER_VISIT' | 'DAYS_BEFORE_EXPIRY' | 'BEFORE_APPOINTMENT'

export const HORA_DAS_CAMPANHAS_DO_DIA = 9

const DO_DIA: GatilhoDaCampanha[] = ['BIRTHDAY', 'ANNUAL_DATE', 'DAYS_AFTER_VISIT', 'DAYS_BEFORE_EXPIRY']

/** O cron pode disparar este gatilho nesta hora de Brasília (0–23)? */
export function jaEhHoraDeDisparar(gatilho: GatilhoDaCampanha, horaEmBrasilia: number): boolean {
  return !DO_DIA.includes(gatilho) || horaEmBrasilia >= HORA_DAS_CAMPANHAS_DO_DIA
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')
const aPartirDas = `a partir das ${doisDigitos(HORA_DAS_CAMPANHAS_DO_DIA)}:00`

/** "no dia do aniversário da cliente, a partir das 09:00" — o que a revisão e os detalhes dizem. */
export function quandoDispara(gatilho: GatilhoDaCampanha | null | undefined, config?: { days?: number; hours?: number; month?: number; day?: number } | null): string {
  switch (gatilho) {
    case 'BIRTHDAY':           return `no dia do aniversário da cliente, ${aPartirDas}`
    case 'ANNUAL_DATE':        return `todo ano em ${doisDigitos(config?.day ?? 0)}/${doisDigitos(config?.month ?? 0)}, ${aPartirDas}`
    case 'DAYS_AFTER_VISIT':   return `${config?.days ?? '?'} dias depois do último atendimento da cliente, ${aPartirDas}`
    case 'DAYS_BEFORE_EXPIRY': return `${config?.days ?? '?'} dias antes de o pacote da cliente vencer, ${aPartirDas}`
    case 'BEFORE_APPOINTMENT': return `${config?.hours ?? 24} horas antes de cada agendamento confirmado (conferido de hora em hora)`
    default:                   return 'escolha o gatilho'
  }
}
