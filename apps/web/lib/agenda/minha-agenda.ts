import { agendamentosNoDia } from '@/lib/agenda/trecho-do-agendamento'
import type { AgendamentoNaGrade } from '@/lib/agenda/desenho'
import { emAndamento } from '@/lib/agenda/em-andamento'
import { fimDaOcupacao } from '@/lib/appointments/ocupacao'

/**
 * Os rótulos dos cartões do topo da "Minha agenda" (A22 da 22ª simulação;
 * princípio 3). Quem atende em mais de uma unidade vê os dela de fora como
 * cartões ("Na unidade X"): "Hoje" e "Esta semana" contam as unidades dela, e a
 * ocupação é só a da unidade do cabeçalho — lado a lado, "Hoje: 2" e
 * "Ocupação hoje 0%" pareciam se contradizer. Com algum de outra unidade, os
 * rótulos dizem de onde é cada número.
 */
export function rotulosDaMinhaAgenda({ deOutraUnidade, unidade }: { deOutraUnidade: boolean; unidade: string }): {
  hoje: string; semana: string; ocupacao: string
} {
  if (!deOutraUnidade) return { hoje: 'Hoje', semana: 'Esta semana', ocupacao: 'Ocupação hoje' }
  return { hoje: 'Hoje · suas unidades', semana: 'Esta semana · suas unidades', ocupacao: `Ocupação hoje · ${unidade}` }
}

/**
 * A "Semana" da Minha agenda em lista (A27 da 23ª simulação; princípio 7): eram
 * 7 cartões de dia com barrinhas e nenhum atendimento — clicar num dia voltava
 * ao Dia. Embaixo da faixa, os atendimentos da semana por dia, em ordem; só os
 * dias que têm algum, sem os cancelados (a grade do dia também não os mostra).
 * `diaDo`: a chave AAAA-MM-DD do início, no relógio da grade (a tela passa o
 * `format` de parede; o padrão lê o começo do texto).
 */
export function semanaEmLista<E extends { id: string; start: string; status: string }>(
  eventos: readonly E[],
  dias: readonly string[],
  diaDo: (start: string) => string = s => s.slice(0, 10),
): { dia: string; eventos: E[] }[] {
  return dias.map(dia => ({
    dia,
    eventos: eventos
      .filter(e => e.status !== 'CANCELLED' && diaDo(e.start) === dia)
      .slice()
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
  })).filter(d => d.eventos.length > 0)
}

/**
 * O destaque da "Minha agenda" (o cartão do topo): quem está em atendimento
 * AGORA, o horário que já começou e segue em aberto (A26 da 12ª: "Atrasado:
 * N min") ou o próximo. Olha quem OCUPA o dia (`agendamentosNoDia`): o
 * procedimento não tem duração máxima (25/11), e o longo em atendimento desde
 * ontem — ou que começou ontem e ninguém iniciou — sumia do destaque, que só
 * via os que começaram hoje (princípio 3: a pessoa está nele agora).
 * `continuaDeAntes`: começou num dia anterior — o cartão diz de quando.
 *
 * É também o "Em andamento" da Minha agenda (o Heitor, 25/11: no painel, na
 * Agenda e na Minha agenda — aqui junto do destaque, não num segundo bloco): o
 * "já começou e segue" é a regra única `emAndamento` (lib/agenda/em-andamento);
 * `ate` diz até quando ("até 15:00"; de outro dia, com a data) e
 * `tambemEmAndamento` traz os outros dela em andamento ao mesmo tempo.
 *
 * Puro, "na parede" (o relógio da grade), como `agendamentosNoDia`.
 */
export function destaqueDaMinhaAgenda<E extends AgendamentoNaGrade & { id: string }>(
  eventos: readonly E[], agora: Date,
): { ev: E; label: string; continuaDeAntes: boolean; ate: string | null; tambemEmAndamento: E[] } | null {
  const doDia = agendamentosNoDia(eventos, agora)
  const inicio = (e: E) => new Date(e.start).getTime()
  const naRegra = (e: E) => emAndamento({ status: e.status, scheduled_at: e.start, duration_min: e.durationMin }, agora)
  const emCurso = eventos.filter(naRegra).sort((a, b) => inicio(a) - inicio(b))
  const com = (ev: E, label: string) => ({
    ev, label,
    continuaDeAntes: !!doDia.find(x => x.ev === ev)?.trecho.continuaDeAntes,
    ate: naRegra(ev) ? textoDoAte(fimDaOcupacao({ scheduled_at: ev.start, duration_min: ev.durationMin }), agora) : null,
    tambemEmAndamento: emCurso.filter(e => e !== ev),
  })
  const hoje = doDia.map(x => x.ev)
  // O que ela iniciou e não concluiu segue "em atendimento", mesmo passado do horário.
  const inProgress = emCurso.find(e => e.status === 'IN_PROGRESS') ?? hoje.find(e => e.status === 'IN_PROGRESS')
  if (inProgress) return com(inProgress, 'Em atendimento agora')
  const now = agora.getTime()
  const atrasado = emCurso[0]
  if (atrasado) {
    const min = Math.max(0, Math.floor((now - inicio(atrasado)) / 60_000))
    return com(atrasado, atrasado.status === 'ARRIVED' ? `Check-in · atrasado ${min} min` : `Atrasado: ${min} min`)
  }
  // O já concluído (atendido antes da hora) também sai: o destaque dizia
  // "Próximo atendimento" de quem já tinha ido embora (simulação, 2026-10-20).
  const next = hoje
    .filter(e => inicio(e) > now && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(e.status))
    .sort((a, b) => inicio(a) - inicio(b))[0]
  return next ? com(next, 'Próximo atendimento') : null
}

/** "até 15:00"; noutro dia, "até 11/12 08:00" — na parede, como a grade. */
function textoDoAte(fimMs: number, agora: Date): string {
  const d = new Date(fimMs)
  const p = (n: number) => String(n).padStart(2, '0')
  const mesmoDia = d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth() && d.getDate() === agora.getDate()
  return `até ${mesmoDia ? '' : `${p(d.getDate())}/${p(d.getMonth() + 1)} `}${p(d.getHours())}:${p(d.getMinutes())}`
}
