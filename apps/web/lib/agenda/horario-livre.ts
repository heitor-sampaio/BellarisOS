import type { BlocoOcupado } from '@/lib/agenda/horario'

/**
 * A régua do horário livre de uma profissional (D5 e D15 da 8ª simulação,
 * 2026-11-06; princípio 3): um horário de `duracao` minutos está livre quando
 * o intervalo INTEIRO [início, início + duração) não bate em nenhum
 * agendamento dela nem em nenhum bloqueio dela. Encostar não é bater.
 *
 * O seletor da sessão do pacote só olhava se o INÍCIO caía num ocupado (01:00
 * aparecia livre para 60 min com outro às 01:30, e o Confirmar recusava) e não
 * lia o bloqueio; a "Minha agenda" mostrava "Horário livre" dentro das férias;
 * a ocupação contava o tempo bloqueado como disponível. Puro: roda no
 * navegador. O servidor confere de novo ao gravar (`horarioOcupado`, que
 * recusa o choque; o bloqueio é aviso — o encaixe da equipe é permitido).
 */

export interface AgendamentoQueOcupa { scheduledAt: string; durationMin: number; clientName: string | null }
export interface BloqueioQueOcupa { inicio: string; fim: string; motivo: string }

const bate = (ini: number, fim: number, outroIni: number, outroFim: number) => ini < outroFim && outroIni < fim

/**
 * Quem ocupa o horário: o agendamento (com o nome da cliente) ou o bloqueio
 * (`rotulo` "Bloqueado · motivo"). Nulo: livre.
 */
export function ocupanteDoHorario(
  inicio: Date, duracaoMin: number, agendamentos: AgendamentoQueOcupa[], bloqueios: BloqueioQueOcupa[] = [],
): { clientName: string | null; rotulo?: string } | null {
  const ini = inicio.getTime()
  if (Number.isNaN(ini)) return null
  const fim = ini + Math.max(1, duracaoMin) * 60_000
  for (const a of agendamentos) {
    // O concluído ANTES da hora marcada ocupa zero minutos (A31 da 5ª: só até a
    // conclusão): não ocupa nada. Como ponto, ele "batia" em todo intervalo que
    // o continha — a grade do checkout marcava 03:30, 04:00 e 05:00 e deixava
    // 03:00 livre (A16 da 10ª).
    if (!(a.durationMin > 0)) continue
    const de = new Date(a.scheduledAt).getTime()
    if (bate(ini, fim, de, de + a.durationMin * 60_000)) return { clientName: a.clientName }
  }
  for (const b of bloqueios) {
    if (bate(ini, fim, new Date(b.inicio).getTime(), new Date(b.fim).getTime())) return { clientName: null, rotulo: `Bloqueado · ${b.motivo}` }
  }
  return null
}

/**
 * O que sobra LIVRE de um vão [de, ate) (ms) depois de tirar os bloqueios, em
 * pedaços de pelo menos `minimoMin` minutos — o "Horário livre" da Minha agenda.
 */
export function livresEntre(de: number, ate: number, bloqueios: BloqueioQueOcupa[], minimoMin = 30): [number, number][] {
  const cortes = bloqueios
    .map(b => [new Date(b.inicio).getTime(), new Date(b.fim).getTime()] as [number, number])
    .filter(([i, f]) => bate(de, ate, i, f))
    .sort((a, b) => a[0] - b[0])
  const livres: [number, number][] = []
  let cursor = de
  for (const [i, f] of cortes) {
    if (i > cursor) livres.push([cursor, Math.min(i, ate)])
    cursor = Math.max(cursor, f)
    if (cursor >= ate) break
  }
  if (cursor < ate) livres.push([cursor, ate])
  return livres.filter(([i, f]) => f - i >= minimoMin * 60_000)
}

/**
 * Os bloqueios como blocos ocupados, para a capacidade (`capacidadeEmMinutos`,
 * o `ocupadoFora`): o tempo bloqueado sai do disponível, como o agendamento
 * dela em outra unidade (os blocos se fundem — nada conta duas vezes).
 */
export function blocosDosBloqueios(bloqueios: BloqueioQueOcupa[]): BlocoOcupado[] {
  return bloqueios
    .map(b => ({ inicio: b.inicio, minutos: Math.round((new Date(b.fim).getTime() - new Date(b.inicio).getTime()) / 60_000) }))
    .filter(b => b.minutos > 0)
}
