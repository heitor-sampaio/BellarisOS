import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O que o card diz da cliente ligada (A18 da 7ª simulação, 2026-11-05): o
 * próximo agendamento ("Agendado 06/11 10:30") e a última compra (pacote,
 * pré-pago ou plano aceito), para o card SUGERIR levar a oportunidade a Ganho.
 * Nenhum card anda sozinho (crm-05, princípio 6): quem move é a pessoa.
 * Uma ida ao banco para a lista toda (`crm_sinais_dos_clientes`, a lista no
 * corpo da rpc).
 */
export interface SinaisDaCliente {
  proximoAgendamento: string | null; compraEm: string | null; compra: string | null
  /** O vendido da última compra (A4 da 11ª): o card diz o vendido, não o de interesse. */
  compraValor: number | null
}

export async function sinaisDasClientes(tenantId: string, clientIds: string[]): Promise<Map<string, SinaisDaCliente>> {
  const ids = [...new Set(clientIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const linhas = await ler(createAdminClient().rpc('crm_sinais_do_quadro', { p_tenant: tenantId, p_clientes: ids }),
    'ler o agendamento e a compra das clientes do quadro') as { client_id: string; proximo_agendamento: string | null; compra_em: string | null; compra: string | null; compra_valor: number | string | null }[] | null
  return new Map((linhas ?? []).map(l => [l.client_id, {
    proximoAgendamento: l.proximo_agendamento, compraEm: l.compra_em, compra: l.compra,
    compraValor: l.compra_valor == null ? null : Number(l.compra_valor),
  }]))
}

/** Sugere o Ganho quando a cliente comprou DEPOIS de a oportunidade nascer, e ela segue aberta. */
export function sugereGanho(lead: { created_at: string }, sinais: SinaisDaCliente | undefined, aberta: boolean): boolean {
  return aberta && !!sinais?.compraEm && new Date(sinais.compraEm).getTime() >= new Date(lead.created_at).getTime()
}
