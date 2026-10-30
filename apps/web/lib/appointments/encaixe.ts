// O que o modal de agendamento avisa ANTES de confirmar (J-30, 2026-10-30):
// o encaixe fora do horário da profissional e o choque com outro atendimento
// dela. É AVISO: o encaixe continua permitido (§9.1), e o choque o núcleo
// recusa ao gravar (`horarioOcupado`). Sem 'use server': a action confere a
// sessão e a permissão; aqui, a rede e o alcance.

import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { alcancaUnidade } from '@/lib/auth'
import { dayKeyTZ, partsInTZ } from '@/lib/datetime'
import { normalizarHorario, intervalosDoDia, diaDaSemana, cabeNoHorario, textoDosIntervalos } from '@/lib/agenda/horario'
import { conferirPecasDoAgendamento, primeiroConflito } from '@/lib/appointments/core'

export interface AvisosDoHorario { foraDoHorario: string | null; conflito: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hora = (d: Date) => { const p = partsInTZ(d); return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` }

export async function avisosDoHorarioCore(ctx: TenantContext, a: {
  branchId: string; professionalId: string; scheduledAt: string; procedureId: string | null; durationMin: number
}): Promise<AvisosDoHorario> {
  const nada: AvisosDoHorario = { foraDoHorario: null, conflito: null }
  if (![a.branchId, a.professionalId].every(x => typeof x === 'string' && UUID.test(x))) return nada
  if (a.procedureId != null && (typeof a.procedureId !== 'string' || !UUID.test(a.procedureId))) return nada
  const inicio = new Date(a.scheduledAt)
  if (Number.isNaN(inicio.getTime()) || !alcancaUnidade(ctx, a.branchId)) return nada

  const admin = createAdminClient()
  if (await conferirPecasDoAgendamento(admin, ctx, { branchId: a.branchId, professionalId: a.professionalId })) return nada
  const [unidade, prof, proc] = await Promise.all([
    ler(admin.from('branches').select('horario').eq('id', a.branchId).maybeSingle(), 'buscar o horário da unidade'),
    ler(admin.from('users').select('name, horario').eq('id', a.professionalId).maybeSingle(), 'buscar o horário do profissional'),
    a.procedureId
      ? ler(admin.from('procedures').select('duration_min').eq('id', a.procedureId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o procedimento')
      : Promise.resolve(null),
  ])
  const duracao = Number((proc as { duration_min?: number } | null)?.duration_min)
    || (Number.isFinite(a.durationMin) && a.durationMin > 0 ? Math.min(Math.round(a.durationMin), 720) : 60)
  const nome = (prof as { name?: string } | null)?.name ?? 'A profissional'

  const dia = dayKeyTZ(inicio)
  const intervalos = intervalosDoDia(
    normalizarHorario((unidade as { horario?: unknown } | null)?.horario),
    normalizarHorario((prof as { horario?: unknown } | null)?.horario),
    diaDaSemana(dia),
  )
  const p = partsInTZ(inicio)
  const inicioMin = p.hour * 60 + p.minute
  const foraDoHorario = cabeNoHorario(intervalos, inicioMin, inicioMin + duracao)
    ? null
    : intervalos.length
      ? `Fora do horário de atendimento de ${nome} (${textoDosIntervalos(intervalos)}). O encaixe é permitido.`
      : `${nome} não atende neste dia. O encaixe é permitido.`

  const choque = await primeiroConflito(admin, {
    tenantId: ctx.tenantId!, professionalId: a.professionalId, inicio, duracaoMin: duracao,
  })
  const conflito = choque ? `${nome} já tem atendimento das ${hora(choque.inicio)} às ${hora(choque.fim)}.` : null
  return { foraDoHorario, conflito }
}
