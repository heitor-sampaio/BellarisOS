'use server'

import { getTenantContext, can, alcancaOAgendamento, vistaPessoal, podeVerClinico } from '@/lib/auth'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { rotuloDaAcao, linhasDoHistoricoParaQuemVe } from '@/lib/clients/historico-do-agendamento'

export interface PassoDoHistorico {
  quando: string
  oQue:   string
  /** Quem fez — com a marca "via suporte", quando foi o suporte (o nome que o histórico guardou). */
  quem:   string | null
}

/**
 * Quem fez cada ação de um agendamento, para a janela da agenda (J-27,
 * 2026-10-30): `appointment_history` já guardava o nome, e a janela não o
 * mostrava. Só leitura. Pede a agenda em Ver — ou a vista pessoal (SM2), e
 * então só o agendamento dela; o agendamento é da rede e de unidade ao
 * alcance — o mesmo que a janela já mostra. Fora disso, nada (lista vazia).
 */
export async function historicoDoAgendamento(appointmentId: string): Promise<PassoDoHistorico[]> {
  const ctx = await getTenantContext()
  const pessoal = vistaPessoal(ctx, 'agenda')
  if (!can(ctx, 'agenda', 'VIEW') && !pessoal) throw semAcesso()
  if (typeof appointmentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return []
  const admin = createAdminClient()
  const appt = await ler(admin.from('appointments')
    .select('id, branch_id, professional_id, branches!inner(tenant_id)')
    .eq('id', appointmentId).maybeSingle(), 'buscar o agendamento')
  const rede = (appt?.branches as unknown as { tenant_id: string } | null)?.tenant_id
  if (!appt || rede !== ctx.tenantId || !alcancaOAgendamento(ctx, appt.branch_id as string, appt.professional_id as string | null)) return []
  if (pessoal && appt.professional_id !== pessoal) return []

  const linhas = (await ler(admin.from('appointment_history')
    .select('action, description, changed_by_name, created_at')
    .eq('appointment_id', appointmentId)
    .order('created_at')
    .limit(200), 'carregar o histórico do agendamento')) as { action: string; description: string | null; changed_by_name: string | null; created_at: string }[] | null
  // As linhas da foto clínica só com o Prontuário em Ver (o Heitor, 27/11).
  return linhasDoHistoricoParaQuemVe(linhas ?? [], podeVerClinico(ctx)).map(l => ({ quando: l.created_at, oQue: rotuloDaAcao(l.action, l.description), quem: l.changed_by_name }))
}
