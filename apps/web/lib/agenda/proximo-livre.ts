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

/**
 * O que o modal de agendar diz quando o "próximo livre" TROCA a hora com que
 * ele abriu (D7 da 12ª simulação, 2026-11-11): às 23:10 a Heloísa abriu o
 * Agendar em 23:30 (o último início era 23:00), e o modal gravou 11/11 00:00
 * sem dizer. A hora que a pessoa vê nunca muda calada (princípio 3). `de` e
 * `para` são "AAAA-MM-DDTHH:MM" (o campo de data e hora), `hoje` o dia do
 * aparelho ("AAAA-MM-DD"). Nulo quando não trocou.
 */
export function textoDoProximoLivre(de: string, para: string, nome: string, hoje: string): string | null {
  if (!para || de.slice(0, 16) === para.slice(0, 16)) return null
  const diaDe = de.slice(0, 10)
  const diaPara = para.slice(0, 10)
  const hora = para.slice(11, 16)
  const curto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  if (diaDe === diaPara) return `${de.slice(11, 16)} não está livre para ${nome}. O próximo horário livre é ${hora}.`
  const amanha = new Date(Date.parse(`${hoje}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const quando = diaPara === amanha ? 'amanhã' : curto(diaPara)
  const antes = diaDe === hoje ? 'Hoje não há mais horário livre' : `Em ${curto(diaDe)} não há horário livre`
  return `${antes} para ${nome}. O próximo é ${quando}, ${hora}.`
}
