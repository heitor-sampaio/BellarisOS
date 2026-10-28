import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

export type SeloDaFicha = 'PENDENTE' | 'RESPONDIDA'

/** Status em que o agendamento ainda vai acontecer (ou está acontecendo). */
const EM_ABERTO = new Set(['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'])
/** Ids por consulta: a lista vai na URL do PostgREST. */
const LOTE = 150

/**
 * O selo da ficha de saúde (pré-atendimento) no bloco da agenda (2026-10-21):
 * a mesma regra da janela do agendamento (`situacaoDoPreAtendimento`) —
 * PENDENTE quando a cliente tem a ficha esperando resposta (a dela, aberta
 * por qualquer horário) e o agendamento ainda vai acontecer; RESPONDIDA
 * quando foi respondida para ESTE agendamento — com ao menos uma resposta: a
 * ficha gravada vazia não é respondida (D2 da simulação de 2026-10-28). Só o estado: nada das
 * respostas, que são do prontuário.
 *
 * Quem chama já conferiu a rede e o alcance dos agendamentos.
 */
export async function selosDaFicha(
  tenantId: string,
  agendamentos: { id: string; client_id: string | null; status: string }[],
): Promise<Record<string, SeloDaFicha>> {
  const selos: Record<string, SeloDaFicha> = {}
  if (agendamentos.length === 0) return selos
  const admin = createAdminClient()
  const clientes = [...new Set(agendamentos.filter(a => a.client_id && EM_ABERTO.has(a.status)).map(a => a.client_id!))]
  const ids = agendamentos.map(a => a.id)

  const lotes = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE))
  const [pendentes, respondidas] = await Promise.all([
    Promise.all(lotes(clientes).map(l => ler(admin.from('pre_atendimentos').select('client_id')
      .eq('tenant_id', tenantId).eq('status', 'PENDENTE').in('client_id', l), 'buscar as fichas pendentes da agenda'))),
    Promise.all(lotes(ids).map(l => ler(admin.from('pre_atendimentos').select('appointment_id')
      .eq('tenant_id', tenantId).eq('status', 'RESPONDIDO').neq('respostas', '{}').in('appointment_id', l), 'buscar as fichas respondidas da agenda'))),
  ])
  const comPendente = new Set(pendentes.flatMap(r => (r ?? []).map(p => p.client_id as string)))
  const respondidos = new Set(respondidas.flatMap(r => (r ?? []).map(p => p.appointment_id as string)))

  for (const a of agendamentos) {
    if (a.client_id && EM_ABERTO.has(a.status) && comPendente.has(a.client_id)) selos[a.id] = 'PENDENTE'
    else if (respondidos.has(a.id)) selos[a.id] = 'RESPONDIDA'
  }
  return selos
}
