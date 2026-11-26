import type { BlocoOcupado } from '@/lib/agenda/horario'

/**
 * O "ocupado fora" de quem vê, sem os agendamentos dela em outra unidade que a
 * tela já mostra como CARTÃO (D13 da 33ª simulação). Puro, e devolve uma lista
 * NOVA: a de entrada segue inteira para quem a usa.
 *
 * Só a Minha agenda precisa disto — lá os cartões de fora entram na grade e a
 * ocupação os soma de volta como "ocupado fora" (`professional-agenda.tsx`);
 * sem tirá-los aqui, contariam duas vezes. Na agenda inteira os cartões ficam
 * fora da grade ("Seus atendimentos em outras unidades") e o "ocupado fora" vai
 * inteiro: tirar dele os de quem vê dava 28% no topo da agenda e 30% no
 * dashboard para quem atende nas duas unidades (§13.1: um número, uma fonte).
 */
export function semOsQueJaSaoCartao<B extends BlocoOcupado>(
  blocos: readonly B[], cartoes: readonly { scheduled_at: unknown; duration_min: unknown }[],
): B[] {
  const vistos = cartoes.map(a => `${a.scheduled_at as string}|${a.duration_min as number}`)
  return blocos.filter(b => {
    const i = vistos.indexOf(`${b.inicio}|${b.minutos}`)
    if (i < 0) return true
    vistos.splice(i, 1)
    return false
  })
}
