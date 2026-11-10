'use server'

import { z } from 'zod'
import { getTenantContext, assertPermission, alcancaUnidade, ownerFilter, can } from '@/lib/auth'
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
export interface DocumentoDaJanela {
  id: string; titulo: string; situacao: string; bloqueia: boolean; assinado: boolean
  /**
   * Quem tem os Termos em Gerenciar colhe daqui (A23 da 9ª simulação: o termo
   * que bloqueia não tinha caminho na janela — era Clientes → Documentos →
   * Colher assinatura). Só no que falta assinar, com o documento pronto.
   */
  podeColher: boolean
  /** A8 da 11ª: o link de assinatura também daqui (o documento pronto, PENDENTE). */
  podeEnviarLink: boolean
  /** Há um link valendo, até quando. */
  linkAte: string | null
  /**
   * A9 da 11ª: o que falta no cadastro, dito na janela ("Faltam dados do
   * cadastro: CPF") — só se via na tela do atendimento. Sem "Cliente · ".
   */
  faltando: string[]
  /** A ficha da cliente, para "Completar o cadastro" (quem edita Clientes). */
  clienteId: string | null
  podeCompletar: boolean
}

/** "Cliente · CPF" → "CPF"; "Pagamento · …" → "o pagamento do contrato" (uma vez). */
function oQueFalta(faltando: string[]): string[] {
  const saida: string[] = []
  for (const f of faltando) {
    const t = f.startsWith('Pagamento ·') ? 'o pagamento do contrato' : f.replace(/^Cliente · /, '')
    if (!saida.includes(t)) saida.push(t)
  }
  return saida
}

const SITUACAO: Record<string, string> = {
  ASSINADO: 'Assinado', DISPENSADO: 'Dispensado', PENDENTE: 'Falta assinar', INCOMPLETO: 'Faltam dados do cadastro', A_GERAR: 'Em preparação',
}

export async function documentosDaJanela(appointmentId: string): Promise<DocumentoDaJanela[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  if (!z.string().uuid().safeParse(appointmentId).success) return []
  const ap = await ler(createAdminClient().from('appointments').select('id, branch_id, client_id, professional_id, branches!inner(tenant_id)')
    .eq('id', appointmentId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o agendamento') as
    { id: string; branch_id: string; client_id: string | null; professional_id: string | null } | null
  if (!ap || !alcancaUnidade(ctx, ap.branch_id)) return []
  const dono = ownerFilter(ctx, 'agenda')
  if (dono && ap.professional_id !== dono) return []
  const docs = await documentosDoAgendamento(ctx.tenantId!, ap.id)
  const colhe = can(ctx, 'documents', 'MANAGE')
  const completa = can(ctx, 'clients', 'MANAGE')
  return docs.map(d => {
    const faltando = d.status === 'INCOMPLETO' ? oQueFalta(d.faltando) : []
    return {
      id: d.id, titulo: d.titulo,
      situacao: faltando.length ? `Faltam dados: ${faltando.join(', ')}` : (SITUACAO[d.status] ?? d.status),
      bloqueia: d.exigencia === 'BLOQUEIA', assinado: d.status === 'ASSINADO' || d.status === 'DISPENSADO',
      podeColher: colhe && (d.status === 'PENDENTE' || d.status === 'A_GERAR'),
      podeEnviarLink: colhe && d.status === 'PENDENTE',
      linkAte: d.linkAte,
      faltando,
      clienteId: ap.client_id,
      podeCompletar: completa && faltando.some(f => f !== 'o pagamento do contrato'),
    }
  })
}
