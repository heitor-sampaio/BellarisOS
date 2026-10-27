/**
 * O próximo horário livre a partir de um dia (A20, 2026-10-27): o primeiro
 * livre do dia pedido e, sem nenhum, dos seguintes. Quem diz o que é livre é
 * `livresDoDia` (`computeAvailableSlots`: horário da unidade ∩ profissional,
 * sem os ocupados e, hoje, sem o que já passou) — a mesma conta da agenda.
 */
export async function proximoHorarioLivre(
  dataInicial: string,
  livresDoDia: (data: string) => Promise<string[]>,
  maxDias = 14,
): Promise<{ data: string; hora: string } | null> {
  const [a = 1970, m = 1, d = 1] = dataInicial.split('-').map(Number)
  for (let i = 0; i < maxDias; i++) {
    const data = new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10)
    const livres = await livresDoDia(data)
    const hora = livres[0]
    if (hora) return { data, hora }
  }
  return null
}
