'use server'

import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { acoesEmLote, type AcaoEmLote } from '@/lib/lotes/acoes'
import { dispararHistoricoUazapi } from '@/lib/whatsapp/historico-uazapi'
import { getNumero } from '@/lib/whatsapp/factory'

/** Configurações → Ações em lote: a lista (a tela relê enquanto algo roda). */
export async function listarAcoesEmLote(): Promise<AcaoEmLote[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  return acoesEmLote(ctx.tenantId!)
}

/**
 * "Tentar de novo" de uma ação. O id vem do navegador: a linha tem de ser da
 * rede da sessão, e a caixa, ainda do WhatsApp Web, desta rede e ligada.
 */
export async function repetirAcaoEmLote(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')
  const linha = await ler(createAdminClient().from('whatsapp_historicos')
    .select('whatsapp_number_id').eq('id', id).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a ação') as
    { whatsapp_number_id: string } | null
  if (!linha) return { ok: false, error: 'Ação não encontrada nesta rede.' }
  const numero = await getNumero(linha.whatsapp_number_id)
  if (!numero || numero.tenantId !== ctx.tenantId || numero.provider !== 'uazapi') {
    return { ok: false, error: 'O número desta ação não é mais do WhatsApp Web desta rede.' }
  }
  if (!numero.isActive) return { ok: false, error: 'Conecte o número antes de trazer o histórico de novo.' }
  const aberto = await dispararHistoricoUazapi(ctx.tenantId!, numero.id)
  if (!aberto) return { ok: false, error: 'O histórico deste número já está sendo trazido.' }
  return { ok: true }
}
