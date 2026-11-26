// Se a pessoa ou a sala está DISPONÍVEL num horário — o que as listas da agenda
// oferecem (R13 e R14, o Heitor, 26/11, na página de perguntas: "Só mostra os
// horarios, salas e pessoas que estão livres"). Disponível é o que o núcleo não
// recusaria: sem choque com outro atendimento (`conflitosDoHorario`, a régua de
// `horarioOcupado`) e sem bloqueio (`bloqueiosQueBatem`, a de
// `recusaDoBloqueioNoHorario`). E, para a PESSOA, dentro do horário dela na
// unidade (R15, o Heitor, 26/11, na página de perguntas: "Não: quem está fora do
// horário também some das listas (o encaixe só pelo campo de horário)") — a
// conta do aviso do encaixe (`foraDoHorarioDeQuemAtende`); o núcleo segue
// aceitando o encaixe, com o aviso. Sem 'use server': quem chama já conferiu a
// sessão, a permissão e o alcance.

import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { conflitosDoHorario, fimDaOcupacao, podemOcuparDesde } from '@/lib/appointments/core'
import { bloqueiosQueBatem } from '@/lib/agenda/bloqueios'
import { foraDoHorarioDeQuemAtende, normalizarHorario } from '@/lib/agenda/horario'
import { fusoValido } from '@/lib/unidades/fuso'
import type { Indisponivel } from '@/lib/agenda/so-o-que-esta-livre'
import type { AgendamentoQueOcupa } from '@/lib/agenda/horario-livre'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Por que a pessoa (ou a sala) não está disponível em [inicio, inicio + duração):
 * 'ocupada' (outro atendimento), 'bloqueada' (um bloqueio dela) ou, só a pessoa
 * com `unidadeDoHorario`, 'fora_do_horario' (fora do horário dela naquela
 * unidade, ou a unidade fechada — R15). Nulo: livre. Uma das duas:
 * `professionalId` OU `roomId` (com a unidade da sala, `branchId`).
 */
export async function indisponibilidadeNoHorario(admin: Admin, a: {
  tenantId: string; inicio: Date; duracaoMin: number
  professionalId?: string | null; roomId?: string | null; branchId?: string | null
  /** A unidade em que a PESSOA atenderia: o horário dela ali (R15). Sem ela, o horário não conta. */
  unidadeDoHorario?: string | null
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
  if (a.professionalId && a.unidadeDoHorario && await foraDoHorario(admin, {
    tenantId: a.tenantId, professionalId: a.professionalId, unidadeId: a.unidadeDoHorario, inicio: a.inicio, duracaoMin: a.duracaoMin,
  })) return 'fora_do_horario'
  return null
}

/** A pessoa está fora do horário dela na unidade (a unidade ∩ ela, no relógio da unidade)? A unidade de outra rede não conta. */
async function foraDoHorario(admin: Admin, a: {
  tenantId: string; professionalId: string; unidadeId: string; inicio: Date; duracaoMin: number
}): Promise<boolean> {
  const [unidade, pessoa] = await Promise.all([
    ler(admin.from('branches').select('horario, fuso').eq('id', a.unidadeId).eq('tenant_id', a.tenantId).maybeSingle(), 'buscar o horário da unidade'),
    ler(admin.from('users').select('horario').eq('id', a.professionalId).eq('tenant_id', a.tenantId).maybeSingle(), 'buscar o horário de quem atende'),
  ]) as [{ horario?: unknown; fuso?: string | null } | null, { horario?: unknown } | null]
  if (!unidade) return false
  return foraDoHorarioDeQuemAtende(
    normalizarHorario(unidade.horario), normalizarHorario(pessoa?.horario),
    a.inicio.toISOString(), a.duracaoMin, fusoValido(unidade.fuso),
  )
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
