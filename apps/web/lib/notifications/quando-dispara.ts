import { FUSO_PADRAO, nomeDoFuso } from '@/lib/unidades/fuso'

/**
 * Quando a campanha AGENDADA de todo ano dispara — a regra do cron
 * (`app/api/cron/notification-campaigns`) e o texto que a revisão e os
 * detalhes mostram, num lugar só (D8 da 11ª simulação, 2026-11-10; princípio
 * 3: a tela diz quando a campanha sai).
 *
 * A data de todo ano sai a partir das 09:00 do relógio da rede (F62) — na
 * primeira passada do cron (de hora em hora) depois disso; nunca de
 * madrugada. Os gatilhos de cada cliente (aniversário, lembrete, pós-visita,
 * vencimento de pacote) saíram da campanha em 2026-11-14 (MK1): são modelos
 * nas Automações, com o silêncio noturno delas.
 */
export type GatilhoDaCampanha = 'ANNUAL_DATE'

export const HORA_DAS_CAMPANHAS_DO_DIA = 9

/** O cron pode disparar a data de todo ano nesta hora da rede (0–23)? */
export function jaEhHoraDeDisparar(_gatilho: GatilhoDaCampanha, horaNaRede: number): boolean {
  return horaNaRede >= HORA_DAS_CAMPANHAS_DO_DIA
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')
const aPartirDasHora = `a partir das ${doisDigitos(HORA_DAS_CAMPANHAS_DO_DIA)}:00`

/** "todo ano em 08/03, a partir das 09:00" — o que a revisão e os detalhes dizem. */
export function quandoDispara(gatilho: GatilhoDaCampanha | string | null | undefined, config?: { month?: number; day?: number } | null, fuso?: string): string {
  // A campanha roda no relógio da rede (F62); fora de Brasília, a tela diz qual (A7 da 13ª).
  const aPartirDas = `${aPartirDasHora}${fuso && fuso !== FUSO_PADRAO ? ` (${nomeDoFuso(fuso)})` : ''}`
  if (gatilho === 'ANNUAL_DATE') return `todo ano em ${doisDigitos(config?.day ?? 0)}/${doisDigitos(config?.month ?? 0)}, ${aPartirDas}`
  return 'escolha a data'
}
