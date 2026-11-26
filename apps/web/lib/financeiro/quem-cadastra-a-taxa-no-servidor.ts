import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'
import { adminsAtivasDaRede } from '@/lib/equipe/quem-desfaz'

/**
 * Quem cadastra a taxa da maquininha, para o aviso da venda sem taxa (MQ-10;
 * D6 da 34ª simulação): a taxa é configuração da rede toda, só da Admin da
 * rede (o Heitor, 2026-11-18: "Configuração da rede toda só pela conta
 * admin"). Nulo: a pessoa cadastra (o aviso diz o caminho); senão, os nomes das
 * Admins da rede ativas (o aviso diz quem) — o mesmo do PDV
 * (`maquininhasParaAVenda`, A5 da 16ª).
 */
export async function quemCadastraATaxa(ctx: TenantContext): Promise<string[] | null> {
  if (!ctx.tenantId || mexeNaConfigDaRede(ctx)) return null
  return adminsAtivasDaRede(ctx.tenantId)
}
