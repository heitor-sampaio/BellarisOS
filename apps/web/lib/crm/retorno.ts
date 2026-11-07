/**
 * O lembrete de retorno da oportunidade (A42 da 9ª simulação, 2026-11-07): o
 * DIA combinado para retomar o contato (`leads.retornar_em`) e o que fazer
 * (`retornar_obs`). É aviso para a pessoa — no dia, o sino de quem tem o lead
 * (cron `crm-lembretes`) —, nunca movimento do card (princípio 6).
 */

/** O dia digitado ("2026-11-12"), ou nulo (vazio = sem lembrete). Data impossível também é nulo. */
export function diaDoRetorno(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

/** O que o card diz: "Retornar hoje", "Retornar 12/11", "Retorno atrasado (10/11)". */
export function textoDoRetorno(dia: string, hoje: string): { texto: string; atrasado: boolean; hoje: boolean } {
  const [, m, d] = dia.split('-')
  if (dia === hoje) return { texto: 'Retornar hoje', atrasado: false, hoje: true }
  if (dia < hoje) return { texto: `Retorno atrasado (${d}/${m})`, atrasado: true, hoje: false }
  return { texto: `Retornar ${d}/${m}`, atrasado: false, hoje: false }
}
