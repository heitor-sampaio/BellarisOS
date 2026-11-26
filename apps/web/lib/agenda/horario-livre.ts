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
 * recusa o choque, e `recusaDoBloqueioNoHorario`, que recusa o bloqueio — R07).
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

/** Um cartão da grade da Minha agenda: o que ele OCUPA [de, ate) e até onde ele é DESENHADO (a altura mínima do cartão curto). */
export interface CartaoDaGrade { de: number; ate: number; ateNoDesenho: number }
/** Um "Horário livre" da grade: o vão de verdade [de, ate) e de onde o desenho começa (abaixo do cartão de cima). */
export interface LivreDaGrade { de: number; ate: number; desenhoDe: number }

/**
 * Os "Horário livre" da Minha agenda: os vãos entre os cartões do dia, cada um
 * pelo que sobra livre dele (`livresDoVao`: o `livresEntre` com os cortes — os
 * bloqueios e o que não é horário dela).
 * O vão conta do fim do ÚLTIMO que ainda ocupa (o longo cobre o curto de dentro
 * dele), e o desenho começa abaixo do cartão de cima — o curto é desenhado mais
 * alto do que dura (D11 da 34ª: o "Horário livre" ficava cortado e por cima dos
 * cartões). O texto diz o vão de verdade.
 */
export function livresDaGrade(cartoes: CartaoDaGrade[], livresDoVao: (de: number, ate: number) => [number, number][]): LivreDaGrade[] {
  const ordem = [...cartoes].sort((a, b) => a.de - b.de)
  const livres: LivreDaGrade[] = []
  let ocupaAte = -Infinity, desenhadoAte = -Infinity
  for (const c of ordem) {
    if (ocupaAte > -Infinity && c.de > ocupaAte) {
      for (const [de, ate] of livresDoVao(ocupaAte, c.de)) {
        livres.push({ de, ate, desenhoDe: Math.min(ate, Math.max(de, desenhadoAte)) })
      }
    }
    ocupaAte = Math.max(ocupaAte, c.ate)
    desenhadoAte = Math.max(desenhadoAte, c.ateNoDesenho, c.ate)
  }
  return livres
}
