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
import { conferirPecasDoAgendamento, conflitosDoHorario } from '@/lib/appointments/core'
import { bloqueiosQueBatem } from '@/lib/agenda/bloqueios'
import { avisoDoBloqueioDaProfissional, avisoDoBloqueioDaSala } from '@/lib/agenda/bloqueio'

export interface AvisosDoHorario {
  foraDoHorario: string | null; conflito: string | null
  /** O horário cai num BLOQUEIO da profissional ou da sala (decisão 3 da 7ª): avisa, e o encaixe é permitido. */
  bloqueio?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** "a, b e c". */
const emLista = (itens: string[]) => itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
const hora = (d: Date) => { const p = partsInTZ(d); return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` }

export async function avisosDoHorarioCore(ctx: TenantContext, a: {
  branchId: string; professionalId: string; scheduledAt: string; procedureId: string | null; durationMin: number
  /** Ao REMARCAR (A25), o próprio agendamento não conta como choque. */
  excluir?: string | null
  /** A sala escolhida: o bloqueio dela também avisa. */
  roomId?: string | null
}): Promise<AvisosDoHorario> {
  const nada: AvisosDoHorario = { foraDoHorario: null, conflito: null, bloqueio: null }
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

  // A28 da 7ª: TODOS os que batem ("das 10:00 às 10:30 e das 10:30 às 11:00"),
  // e não só o primeiro.
  const choques = await conflitosDoHorario(admin, {
    tenantId: ctx.tenantId!, professionalId: a.professionalId, inicio, duracaoMin: duracao, excluir: a.excluir ?? null,
  })
  // A30: o outro atendimento de OUTRA unidade diz qual (a recepção desta não vê aquela agenda).
  const trechos = choques.map(ch => `das ${hora(ch.inicio)} às ${hora(ch.fim)}${ch.unidadeId !== a.branchId && ch.unidade ? `, na unidade ${ch.unidade}` : ''}`)
  const conflito = trechos.length ? `${nome} já tem atendimento ${emLista(trechos)}.` : null

  // O bloqueio pontual (decisão 3 da 7ª): da profissional e, com a sala, da
  // sala DESTA unidade. Só aviso — o encaixe é da clínica (princípio 2).
  const fimDoHorario = new Date(inicio.getTime() + duracao * 60_000)
  const sala = a.roomId && UUID.test(a.roomId)
    ? await ler(admin.from('rooms').select('id, name').eq('id', a.roomId).eq('branch_id', a.branchId).maybeSingle(), 'buscar a sala') as { id: string; name: string } | null
    : null
  const [daProfissional, daSala] = await Promise.all([
    bloqueiosQueBatem(admin, { professionalId: a.professionalId, inicio, fim: fimDoHorario }),
    sala ? bloqueiosQueBatem(admin, { roomId: sala.id, inicio, fim: fimDoHorario }) : Promise.resolve([]),
  ])
  const bloqueio = [
    ...daProfissional.map(b => avisoDoBloqueioDaProfissional(nome, b)),
    ...daSala.map(b => avisoDoBloqueioDaSala(sala!.name, b)),
  ].join(' ') || null
  return { foraDoHorario, conflito, bloqueio }
}
