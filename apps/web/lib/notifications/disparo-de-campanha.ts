import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationCampaign } from '@/actions/notification-campaigns'
import { redeEstaBloqueada } from '@/lib/redes/bloqueio'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { lerPublico } from '@/lib/clientes/publico'
import { filtrosDaCampanha } from '@/lib/notifications/filtros-da-campanha'
import { enviarCampanha } from '@/lib/notifications/envio-da-campanha'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { dayKeyTZ } from '@/lib/datetime'

/**
 * O DISPARO de uma campanha (notificação + Web Push + FCM) para o público dela.
 *
 * Morava em `actions/notification-campaigns.ts` e era EXPORTADO de um arquivo
 * `'use server'` — ou seja, um endpoint público que recebia a campanha e a rede
 * como argumento, sem conferir ninguém: qualquer pessoa disparava notificação
 * para os clientes de qualquer rede (achado em 2026-10-03). Fora de
 * `'use server'`, só quem o importa no servidor o chama: `activateCampaign`
 * (que confere `marketing: MANAGE`) e o cron (que confere o `CRON_SECRET`).
 */

// -- Disparo do público inteiro ------------------------------------------
// Usado pelo activateCampaign (IMEDIATA) e pelo cron (agendada, data do ano).

export async function dispatchCampaignInline(
  campaign: NotificationCampaign,
  tenantId: string,
): Promise<{ sent: number; error?: string }> {
  // Rede bloqueada (assinatura): campanha não sai.
  if (await redeEstaBloqueada(tenantId)) return { sent: 0, error: 'A rede está bloqueada (assinatura).' }
  if (!(await redeTemRecurso(tenantId, 'campanhas'))) return { sent: 0, error: 'Campanhas não estão no plano da rede.' }

  // O público inteiro, filtrado no banco (lib/clientes/publico.ts). Era lido
  // com teto de 2000 — o PostgREST devolvia 1000 — e o filtro de procedimento
  // aplicado depois, sobre esse lote.
  let eligibleClients: { id: string; name: string }[]
  try {
    // Todas as regras gravadas (filtrosDaCampanha, a conta da prévia): até a
    // 9ª simulação o "sem visita há mais de N dias" não chegava aqui (D1).
    eligibleClients = await lerPublico(tenantId, filtrosDaCampanha(campaign.audience_rules))
  } catch (e) {
    return { sent: 0, error: e instanceof Error ? e.message : String(e) }
  }
  if (eligibleClients.length === 0) return { sent: 0 }

  // O envio é um só (lib/notifications/envio-da-campanha): os aparelhos de
  // todas as fichas do login, e um disparo por cliente e dia, reivindicado.
  const dia = dayKeyTZ(new Date(), await fusoDaRede(tenantId))
  const sent = await enviarCampanha(createAdminClient(), campaign, eligibleClients, dia)
  return { sent }
}
