'use server'

import { z } from 'zod'
import { getTenantContext, assertPermission, alcancaUnidade, ownerFilter } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { documentosDoAgendamento } from '@/lib/documentos/leitura'

/**
 * Os termos e contratos de um agendamento, para a JANELA da agenda (A34 da 6ª
 * simulação, 2026-11-04): a janela não dizia se o termo que bloqueia o início
 * estava assinado — só a sessão dizia. Só o título, a situação e se bloqueia
 * (nada do conteúdo); o agendamento da rede, ao alcance da unidade e, com a
 * agenda "só os meus", dela.
 */
export interface DocumentoDaJanela { id: string; titulo: string; situacao: string; bloqueia: boolean; assinado: boolean }

const SITUACAO: Record<string, string> = {
  ASSINADO: 'Assinado', DISPENSADO: 'Dispensado', PENDENTE: 'Falta assinar', INCOMPLETO: 'Faltam dados do cadastro', A_GERAR: 'Em preparação',
}

export async function documentosDaJanela(appointmentId: string): Promise<DocumentoDaJanela[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  if (!z.string().uuid().safeParse(appointmentId).success) return []
  const ap = await ler(createAdminClient().from('appointments').select('id, branch_id, professional_id, branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o agendamento') as
    { id: string; branch_id: string; professional_id: string | null } | null
  if (!ap || !alcancaUnidade(ctx, ap.branch_id)) return []
  const dono = ownerFilter(ctx, 'agenda')
  if (dono && ap.professional_id !== dono) return []
  const docs = await documentosDoAgendamento(ctx.tenantId!, ap.id)
  return docs.map(d => ({
    id: d.id, titulo: d.titulo, situacao: SITUACAO[d.status] ?? d.status,
    bloqueia: d.exigencia === 'BLOQUEIA', assinado: d.status === 'ASSINADO' || d.status === 'DISPENSADO',
  }))
}
