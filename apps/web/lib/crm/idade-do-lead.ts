import { dayKeyTZ } from '@/lib/datetime'

/**
 * "hoje", "ontem" ou "há N dias" do card do lead, pelo DIA de Brasília (D12 da
 * 12ª simulação, 2026-11-11): o lead das 23:20 de 10/11 dizia "hoje" às 00:05
 * de 11/11 — eram 24 h corridas (`differenceInDays`), não o calendário.
 */
export function idadeDoLead(criadoEm: string, agora: number | Date): string {
  const dia = (d: string) => Date.parse(`${d}T12:00:00Z`)
  const dias = Math.max(0, Math.round((dia(dayKeyTZ(new Date(agora))) - dia(dayKeyTZ(criadoEm))) / 86_400_000))
  return dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`
}
