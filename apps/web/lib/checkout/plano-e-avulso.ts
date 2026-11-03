import 'server-only'
import { formatBRL } from '@estetica-os/utils'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O plano e o agendamento avulso do MESMO procedimento (D-18 / "Reforça",
 * item 12, e A68 da 5ª simulação): a Rosana via no app o plano de R$ 3.600
 * (2× Bioestimulador) e, ao lado, o Bioestimulador de R$ 1.800 agendado pelo
 * médico, sem ligação nenhuma — "a cliente não sabe se paga os dois". O
 * agendar, o checkout do plano e o app AVISAM; nada se bloqueia.
 */

export interface PlanoComOProcedimento {
  id:           string
  nome:         string | null
  status:       'PROPOSED' | 'ACCEPTED'
  procedimento: string
  /** As sessões do plano com o procedimento — no fechado, só as ainda sem agendamento. */
  sessoes:      number
  valor:        number
}

export interface AvulsoDoPlano {
  id:           string
  procedimento: string
  scheduledAt:  string
  preco:        number
}

type SessaoLida = { appointment_id: string | null; treatment_plan_session_procedures: { procedure_id: string; price: number | null; procedures: { name: string } | null }[] | null }

/** Os planos proposto ou fechado da cliente que têm o procedimento (o fechado, só com sessão livre dele). */
export async function planosComOProcedimento(
  admin: Admin, tenantId: string, clientId: string, procedureId: string,
): Promise<PlanoComOProcedimento[]> {
  const planos = await ler(admin.from('treatment_plans')
    .select('id, name, status, branches!branch_id!inner(tenant_id), treatment_plan_sessions(appointment_id, treatment_plan_session_procedures(procedure_id, price, procedures(name)))')
    .eq('client_id', clientId).eq('branches.tenant_id', tenantId).in('status', ['PROPOSED', 'ACCEPTED'])
    .order('created_at', { ascending: false }).limit(20), 'buscar os planos da cliente') as unknown as {
      id: string; name: string | null; status: 'PROPOSED' | 'ACCEPTED'; treatment_plan_sessions: SessaoLida[] | null
    }[] | null
  const saida: PlanoComOProcedimento[] = []
  for (const p of planos ?? []) {
    const sessoes = p.treatment_plan_sessions ?? []
    const comOProc = sessoes.filter(s => (s.treatment_plan_session_procedures ?? []).some(x => x.procedure_id === procedureId))
    const contam = p.status === 'ACCEPTED' ? comOProc.filter(s => !s.appointment_id) : comOProc
    if (!contam.length) continue
    const nome = comOProc.flatMap(s => s.treatment_plan_session_procedures ?? []).find(x => x.procedure_id === procedureId)?.procedures?.name ?? 'o procedimento'
    const valor = sessoes.flatMap(s => s.treatment_plan_session_procedures ?? []).reduce((t, x) => t + Math.round(Number(x.price ?? 0) * 100), 0) / 100
    saida.push({ id: p.id, nome: p.name, status: p.status, procedimento: nome, sessoes: contam.length, valor })
  }
  return saida
}

/** "Rosana tem um plano proposto com Bioestimulador (2 sessões · R$ 3.600,00). Agendar pelo plano?" */
export function textoDoPlano(primeiroNome: string, p: PlanoComOProcedimento): string {
  const quem = primeiroNome || 'A cliente'
  const sessoes = `${p.sessoes} ${p.sessoes === 1 ? 'sessão' : 'sessões'}`
  return p.status === 'ACCEPTED'
    ? `${quem} tem um plano fechado com ${p.procedimento} (${sessoes} ainda sem agendamento). Agendar pela sessão do plano? Avulso, ele é cobrado de novo.`
    : `${quem} tem um plano proposto com ${p.procedimento} (${sessoes} · ${formatBRL(p.valor)}). Agendar pelo plano? Avulso, ele é cobrado à parte.`
}

/**
 * Os agendamentos AVULSOS, ainda por vir, da cliente do plano, de um
 * procedimento que está no plano: sem plano, fora de pacote e de pré-pago.
 */
export async function avulsosDoPlano(admin: Admin, tenantId: string, planId: string): Promise<AvulsoDoPlano[]> {
  const plano = await ler(admin.from('treatment_plans')
    .select('client_id, branches!branch_id!inner(tenant_id), treatment_plan_sessions(treatment_plan_session_procedures(procedure_id))')
    .eq('id', planId).eq('branches.tenant_id', tenantId).maybeSingle(), 'buscar o plano') as unknown as {
      client_id: string | null; treatment_plan_sessions: { treatment_plan_session_procedures: { procedure_id: string }[] | null }[] | null
    } | null
  if (!plano?.client_id) return []
  const procs = [...new Set((plano.treatment_plan_sessions ?? []).flatMap(s => (s.treatment_plan_session_procedures ?? []).map(x => x.procedure_id)))]
  if (!procs.length) return []
  const ags = await ler(admin.from('appointments')
    .select('id, scheduled_at, price, procedures(name), branches!inner(tenant_id)')
    .eq('client_id', plano.client_id).eq('branches.tenant_id', tenantId).is('treatment_plan_id', null)
    .in('procedure_id', procs).in('status', ['SCHEDULED', 'CONFIRMED', 'ARRIVED'])
    .gte('scheduled_at', new Date(Date.now() - 12 * 3_600_000).toISOString())
    .order('scheduled_at').limit(20), 'buscar os agendamentos avulsos da cliente') as unknown as {
      id: string; scheduled_at: string; price: number | null; procedures: { name: string } | null
    }[] | null
  if (!ags?.length) return []
  const ids = ags.map(a => a.id)
  const [deP, dePP] = await Promise.all([
    ler(admin.from('package_sessions').select('appointment_id').in('appointment_id', ids), 'buscar as sessões de pacote') as Promise<{ appointment_id: string }[] | null>,
    ler(admin.from('procedure_sale_units').select('appointment_id').in('appointment_id', ids), 'buscar as unidades pré-pagas') as Promise<{ appointment_id: string }[] | null>,
  ])
  const pagos = new Set([...(deP ?? []), ...(dePP ?? [])].map(x => x.appointment_id))
  return ags.filter(a => !pagos.has(a.id)).map(a => ({
    id: a.id, procedimento: a.procedures?.name ?? 'Procedimento', scheduledAt: a.scheduled_at, preco: Number(a.price ?? 0),
  }))
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
}).replace(',', ' às')

/** "Bioestimulador agendado à parte em 03/11 às 16:00 (R$ 1.800,00)". */
export function textoDoAvulso(a: AvulsoDoPlano): string {
  return `${a.procedimento} agendado à parte em ${quando(a.scheduledAt)} (${formatBRL(a.preco)})`
}
