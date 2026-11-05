import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { BloqueioDaAgenda } from '@/lib/agenda/bloqueio'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A leitura do bloqueio pontual da agenda (decisão 3 da 7ª simulação). Só o
 * servidor lê `agenda_bloqueios` (RLS sem política): quem chama já conferiu a
 * sessão, a permissão e a rede. As contas e o texto estão em
 * `lib/agenda/bloqueio.ts`.
 */
const COLUNAS = 'id, branch_id, professional_id, room_id, inicio, fim, motivo, criado_por_nome'

function daLinha(l: Record<string, unknown>): BloqueioDaAgenda {
  return {
    id: String(l.id), branchId: String(l.branch_id),
    professionalId: (l.professional_id as string | null) ?? null, roomId: (l.room_id as string | null) ?? null,
    inicio: String(l.inicio), fim: String(l.fim), motivo: String(l.motivo),
    criadoPorNome: (l.criado_por_nome as string | null) ?? null,
  }
}

/**
 * Os bloqueios da rede que tocam [de, ate): das profissionais pedidas e das
 * salas pedidas (as listas vazias não leem nada). É o que a grade desenha.
 */
export async function bloqueiosDoPeriodo(tenantId: string, o: {
  de: string; ate: string; profissionais?: string[]; salas?: string[]; unidades?: string[]
}, admin: Admin = createAdminClient()): Promise<BloqueioDaAgenda[]> {
  const profs = [...new Set(o.profissionais ?? [])].slice(0, 150)
  const salas = [...new Set(o.salas ?? [])].slice(0, 150)
  const unidades = [...new Set(o.unidades ?? [])].slice(0, 150)
  const filtros: string[] = []
  if (profs.length) filtros.push(`professional_id.in.(${profs.join(',')})`)
  if (salas.length) filtros.push(`room_id.in.(${salas.join(',')})`)
  if (unidades.length) filtros.push(`branch_id.in.(${unidades.join(',')})`)
  if (!filtros.length) return []
  const linhas = await ler(admin.from('agenda_bloqueios').select(COLUNAS)
    .eq('tenant_id', tenantId).lt('inicio', o.ate).gt('fim', o.de).or(filtros.join(','))
    .order('inicio').order('id').limit(500), 'carregar os bloqueios da agenda')
  return ((linhas ?? []) as Record<string, unknown>[]).map(daLinha)
}

/** Os bloqueios de UMA profissional (ou de UMA sala) que batem com [inicio, fim). */
export async function bloqueiosQueBatem(admin: Admin, o: {
  professionalId?: string | null; roomId?: string | null; inicio: Date; fim: Date
}): Promise<BloqueioDaAgenda[]> {
  if (!o.professionalId && !o.roomId) return []
  let q = admin.from('agenda_bloqueios').select(COLUNAS)
    .lt('inicio', o.fim.toISOString()).gt('fim', o.inicio.toISOString())
  q = o.professionalId ? q.eq('professional_id', o.professionalId) : q.eq('room_id', o.roomId!)
  const linhas = await ler(q.order('inicio').limit(20), 'conferir os bloqueios do horário')
  return ((linhas ?? []) as Record<string, unknown>[]).map(daLinha)
}
