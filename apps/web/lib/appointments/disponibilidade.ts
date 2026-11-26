// Se a pessoa ou a sala está DISPONÍVEL num horário — o que as listas da agenda
// oferecem (R13 e R14, o Heitor, 26/11, na página de perguntas: "Só mostra os
// horarios, salas e pessoas que estão livres"). Disponível é o que o núcleo não
// recusaria: sem choque com outro atendimento (`conflitosDoHorario`, a régua de
// `horarioOcupado`) e sem bloqueio (`bloqueiosQueBatem`, a de
// `recusaDoBloqueioNoHorario`). Sem 'use server': quem chama já conferiu a
// sessão, a permissão e o alcance.

import { createAdminClient } from '@/lib/supabase/admin'
import { lerTodas } from '@/lib/db'
import { conflitosDoHorario, fimDaOcupacao, podemOcuparDesde } from '@/lib/appointments/core'
import { bloqueiosQueBatem } from '@/lib/agenda/bloqueios'
import type { Indisponivel } from '@/lib/agenda/so-o-que-esta-livre'
import type { AgendamentoQueOcupa } from '@/lib/agenda/horario-livre'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Por que a pessoa (ou a sala) não está disponível em [inicio, inicio + duração):
 * 'ocupada' (outro atendimento), 'bloqueada' (um bloqueio dela). Nulo: livre.
 * Uma das duas: `professionalId` OU `roomId` (com a unidade da sala).
 */
export async function indisponibilidadeNoHorario(admin: Admin, a: {
  tenantId: string; inicio: Date; duracaoMin: number
  professionalId?: string | null; roomId?: string | null; branchId?: string | null
  /** O próprio agendamento (trocar quem atende, mudar de unidade). */
  excluir?: string | null
}): Promise<Indisponivel | null> {
  const fim = new Date(a.inicio.getTime() + Math.max(1, a.duracaoMin) * 60_000)
  const pessoa = a.professionalId ? { professionalId: a.professionalId } : { roomId: a.roomId ?? null }
  const [choques, bloqueios] = await Promise.all([
    conflitosDoHorario(admin, { tenantId: a.tenantId, inicio: a.inicio, duracaoMin: a.duracaoMin, ...pessoa, branchId: a.branchId ?? null, excluir: a.excluir ?? null }),
    bloqueiosQueBatem(admin, { ...pessoa, inicio: a.inicio, fim }),
  ])
  if (choques.length) return 'ocupada'
  if (bloqueios.length) return 'bloqueada'
  return null
}

/**
 * Os atendimentos que ocupam a SALA entre `de` e `ate` (ISO), de qualquer
 * profissional e de qualquer duração (`podemOcuparDesde`), em páginas: a grade
 * do Agendar com a sala escolhida e o "Usar o próximo livre" com a sala os
 * tiram (R14). Cada um até quando OCUPA (`fimDaOcupacao`).
 */
export async function ocupacaoDaSala(admin: Admin, a: {
  tenantId: string; branchId: string; roomId: string; de: string; ate: string
}): Promise<AgendamentoQueOcupa[]> {
  const linhas = await lerTodas((de, ate) => admin
    .from('appointments')
    .select('id, scheduled_at, duration_min, status, completed_at, branch_id, clients(name), branches!inner(tenant_id)')
    .eq('branches.tenant_id', a.tenantId)
    .eq('branch_id', a.branchId)
    .eq('room_id', a.roomId)
    .or(podemOcuparDesde(new Date(a.de).getTime()))
    .lte('scheduled_at', a.ate)
    .not('status', 'in', '("CANCELLED","NO_SHOW")')
    .order('scheduled_at').order('id').range(de, ate), 'carregar os atendimentos da sala') as unknown as {
      scheduled_at: string; duration_min: number | null; status: string; completed_at: string | null; clients: { name: string } | null
    }[]
  const desde = new Date(a.de).getTime()
  return (linhas ?? []).filter(l => fimDaOcupacao(l) > desde).map(l => ({
    scheduledAt: l.scheduled_at,
    durationMin: Math.max(0, Math.round((fimDaOcupacao(l) - new Date(l.scheduled_at).getTime()) / 60_000)),
    clientName: l.clients?.name ?? null,
  }))
}
