import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { oQueAvalia, type NotaDoProcedimento, type OQueAClienteAvalia } from '@/lib/avaliacao/notas'

type Admin = ReturnType<typeof createAdminClient>

/** O que a clínica pede à cliente (F17-3). */
export async function oQueAClinicaAvalia(admin: Admin, tenantId: string): Promise<OQueAClienteAvalia> {
  const t = await ler(admin.from('tenants').select('avaliacao_o_que').eq('id', tenantId).maybeSingle(),
    'ler o que a cliente avalia') as { avaliacao_o_que: string | null } | null
  return oQueAvalia(t?.avaliacao_o_que)
}

/**
 * Os procedimentos FEITOS no atendimento, um de cada (a sessão de plano Botox +
 * Preenchimento são dois; o Botox duas vezes na sessão, um) — a mesma régua das
 * execuções (`metrics_procedimentos_executados`), na ordem da sessão.
 */
export async function procedimentosDoAtendimento(admin: Admin, appointmentId: string, procedureId: string | null): Promise<{ id: string; nome: string }[]> {
  const feitos = (await ler(admin.rpc('metrics_procedimentos_executados', { p_appointment: appointmentId, p_procedure: procedureId }),
    'ler os procedimentos do atendimento') as { procedure_id: string }[] | null) ?? []
  const ids = [...new Set(feitos.map(f => f.procedure_id))]
  if (!ids.length) return []
  const nomes = (await ler(admin.from('procedures').select('id, name').in('id', ids), 'ler os nomes dos procedimentos') as { id: string; name: string }[] | null) ?? []
  const porId = new Map(nomes.map(p => [p.id, p.name]))
  return ids.map(id => ({ id, nome: porId.get(id) ?? 'Procedimento' }))
}

/** As notas que a cliente deu a cada procedimento, por atendimento (só os ids já conferidos por quem chama). */
export async function notasDosProcedimentos(admin: Admin, appointmentIds: readonly string[]): Promise<Map<string, NotaDoProcedimento[]>> {
  const mapa = new Map<string, NotaDoProcedimento[]>()
  if (!appointmentIds.length) return mapa
  // Sem embed de `procedures`: a tabela não tem chave estrangeira para ela de
  // propósito (com as duas, o PostgREST a lia como junção appointments ↔
  // procedures e todo `appointments → procedures(name)` quebrava — migration
  // 20261104001804). Os nomes vêm numa segunda leitura.
  const linhas = (await ler(admin.from('avaliacoes_dos_procedimentos')
    .select('appointment_id, procedure_id, nota, ordem')
    .in('appointment_id', [...appointmentIds])
    .order('ordem').order('procedure_id'), 'ler as notas dos procedimentos') as
    { appointment_id: string; procedure_id: string; nota: number }[] | null) ?? []
  const ids = [...new Set(linhas.map(l => l.procedure_id))]
  const nomes = ids.length
    ? new Map(((await ler(admin.from('procedures').select('id, name').in('id', ids), 'ler os nomes dos procedimentos avaliados') as { id: string; name: string }[] | null) ?? []).map(p => [p.id, p.name]))
    : new Map<string, string>()
  for (const l of linhas) {
    const lista = mapa.get(l.appointment_id) ?? []
    lista.push({ procedureId: l.procedure_id, nome: nomes.get(l.procedure_id) ?? 'Procedimento', nota: Number(l.nota) })
    mapa.set(l.appointment_id, lista)
  }
  return mapa
}
