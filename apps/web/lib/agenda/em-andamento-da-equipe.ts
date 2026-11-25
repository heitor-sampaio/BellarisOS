import { emAndamento } from '@/lib/agenda/em-andamento'
import { fimDaOcupacao } from '@/lib/appointments/ocupacao'
import { formatarNoFuso } from '@/lib/formatar-no-fuso'
import { dayKeyTZ, BUSINESS_TZ } from '@/lib/datetime'

/**
 * O "Em andamento" nas telas da EQUIPE (o Heitor, 25/11: "Acho que seria mais
 * útil para rede/clínica. A cliente vai estar sendo atendida não vai ficar
 * vendo o app durante o atendimento, mas pode manter lá."). A proposta que ele
 * aprovou: cada bloco mostra quem está sendo atendido, por quem, em qual sala,
 * desde quando e até quando; só aparece quando houver algo; segue a
 * abrangência e a permissão da Agenda (na Minha agenda, só os dela).
 *
 * Puro (roda no servidor e no navegador). A regra é a de `emAndamento`
 * (lib/agenda/em-andamento.ts) — aqui só se monta a linha da tela. A leitura
 * do banco é `lerEmAndamento` (lib/agenda/ler-em-andamento.ts).
 */

/** A linha como o servidor a lê (o agendamento com os nomes). */
export interface LinhaDoEmAndamento {
  id: string
  status: string
  scheduled_at: string
  duration_min: number | null
  clients: { name: string } | null
  procedures: { name: string } | null
  users: { name: string } | null
  rooms: { name: string } | null
  branches: { name: string; fuso: string | null } | null
}

/** Uma linha do bloco: tudo o que a tela mostra, já com os nomes. */
export interface EmAndamentoNaTela {
  id: string
  status: string
  /** O início real (instante do banco). */
  scheduledAt: string
  durationMin: number | null
  cliente: string
  quemAtende: string
  procedimento: string
  sala: string | null
  unidade: string | null
  /** O fuso da unidade: as horas se escrevem no relógio dela. */
  fuso: string
  /** O fim da ocupação (instante, ISO). */
  ate: string
}

const comoNaRegra = (i: { status: string; scheduledAt: string; durationMin: number | null }) =>
  ({ status: i.status, scheduled_at: i.scheduledAt, duration_min: i.durationMin })

/** Os que estão em andamento AGORA, do início mais antigo ao mais novo. */
export function osEmAndamento<T extends { status: string; scheduledAt: string; durationMin: number | null }>(itens: readonly T[], agora: Date): T[] {
  return itens.filter(i => emAndamento(comoNaRegra(i), agora))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
}

/** As linhas lidas viram as do bloco — só as em andamento (`emAndamento`). */
export function paraOEmAndamento(linhas: readonly LinhaDoEmAndamento[], agora: Date): EmAndamentoNaTela[] {
  return osEmAndamento(linhas.map(l => ({
    id: l.id,
    status: l.status,
    scheduledAt: l.scheduled_at,
    durationMin: l.duration_min,
    cliente: l.clients?.name ?? '—',
    quemAtende: l.users?.name ?? '—',
    procedimento: l.procedures?.name ?? '—',
    sala: l.rooms?.name ?? null,
    unidade: l.branches?.name ?? null,
    fuso: l.branches?.fuso || BUSINESS_TZ,
    ate: new Date(fimDaOcupacao({ scheduled_at: l.scheduled_at, duration_min: l.duration_min })).toISOString(),
  })), agora)
}

/**
 * "desde 14:00" e "até 15:00", no relógio da unidade; o que é de outro dia
 * leva a data ("desde 09/12 10:00", "até 11/12 08:00") — o longo que começou
 * antes diz de quando vem.
 */
export function quandoDoEmAndamento(item: Pick<EmAndamentoNaTela, 'scheduledAt' | 'ate' | 'fuso'>, agora: Date): { desde: string; ate: string } {
  const hoje = dayKeyTZ(agora, item.fuso)
  const hora = (iso: string) => formatarNoFuso(iso, dayKeyTZ(iso, item.fuso) === hoje ? 'HH:mm' : 'dd/MM HH:mm', item.fuso)
  return { desde: `desde ${hora(item.scheduledAt)}`, ate: `até ${hora(item.ate)}` }
}
