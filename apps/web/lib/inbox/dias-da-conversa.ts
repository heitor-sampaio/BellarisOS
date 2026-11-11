import { dayKeyTZ } from '@/lib/datetime'

/**
 * As mensagens da conversa por DIA de Brasília (sobra da F33, 8ª simulação,
 * 2026-11-06): o agrupamento era `created_at.slice(0, 10)`, o dia em UTC — a
 * mensagem das 23:30 caía no separador do dia seguinte (a regra de §14:
 * agrupar por dia é `dayKeyTZ`). A ordem é a das mensagens.
 */
export function agruparPorDia<M extends { created_at: string }>(msgs: readonly M[], fuso?: string): { date: string; msgs: M[] }[] {
  const grupos: { date: string; msgs: M[] }[] = []
  for (const m of msgs) {
    const dia = dayKeyTZ(m.created_at, fuso)
    const ultimo = grupos.at(-1)
    if (ultimo?.date === dia) ultimo.msgs.push(m)
    else grupos.push({ date: dia, msgs: [m] })
  }
  return grupos
}
