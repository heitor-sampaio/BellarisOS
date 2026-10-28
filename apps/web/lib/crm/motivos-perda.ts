import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import type { LeadChange } from '@/lib/lead-events'
import { motivosComOutroPorUltimo } from '@/lib/crm/motivos-ordem'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O motivo da perda (2026-10-21, decisão do Heitor): uma lista de motivos da
 * rede (`crm_motivos_perda`, editável em "Configurar funis"), mais observação.
 * Levar o lead a uma etapa de desfecho LOST pela TELA exige o motivo; o
 * Copilot e as automações movem sem ele (o lead fica "Sem motivo" no
 * relatório). Sair da etapa perdida limpa o motivo do lead — a linha do tempo
 * guarda o histórico.
 */

export interface MotivoDePerda { id: string; nome: string; ativo: boolean }
export interface PerdaInformada { motivoId: string; obs?: string | null }

export async function motivosDaRede(admin: Admin, tenantId: string, incluirInativos = false): Promise<MotivoDePerda[]> {
  let q = admin.from('crm_motivos_perda').select('id, nome, ativo').eq('tenant_id', tenantId)
  if (!incluirInativos) q = q.eq('ativo', true)
  // "Outro" sempre por último, também quando a clínica cria motivo depois dele.
  return motivosComOutroPorUltimo(((await ler(q.order('posicao').order('nome'), 'carregar os motivos de perda')) ?? []) as MotivoDePerda[])
}

/**
 * Os campos do lead para a etapa de destino: na perdida, o motivo (conferido
 * na rede) e quando; fora dela, tudo limpo. E a mudança para a linha do tempo.
 */
export async function camposDaPerda(admin: Admin, tenantId: string, opcoes: {
  desfechoDestino: string | null
  perda?: PerdaInformada | null
  exigirMotivo: boolean
}): Promise<{ patch: Record<string, unknown>; mudanca: LeadChange | null } | { error: string }> {
  if (opcoes.desfechoDestino !== 'LOST') {
    return { patch: { motivo_perda_id: null, motivo_perda_obs: null, perdido_em: null }, mudanca: null }
  }
  const perda = opcoes.perda
  if (!perda?.motivoId) {
    if (opcoes.exigirMotivo) return { error: 'Informe o motivo da perda.' }
    return { patch: { motivo_perda_id: null, motivo_perda_obs: null, perdido_em: new Date().toISOString() }, mudanca: null }
  }
  const motivo = await ler(admin.from('crm_motivos_perda').select('id, nome')
    .eq('id', perda.motivoId).eq('tenant_id', tenantId).maybeSingle(), 'conferir o motivo da perda') as { id: string; nome: string } | null
  if (!motivo) return { error: 'Motivo de perda não encontrado.' }
  const obs = (perda.obs ?? '').trim().slice(0, 300) || null
  return {
    patch: { motivo_perda_id: motivo.id, motivo_perda_obs: obs, perdido_em: new Date().toISOString() },
    mudanca: { campo: 'Motivo da perda', de: null, para: obs ? `${motivo.nome} — ${obs}` : motivo.nome },
  }
}
