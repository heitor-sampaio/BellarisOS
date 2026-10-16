import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { startOfMonthTZ, addMonthsTZ, addDaysTZ } from '@/lib/datetime'
import {
  ehCategoriaDeCobranca, estimarCusto, type CategoriaDeCobranca, type CobrancaDoNumero,
} from '@/lib/whatsapp/cobranca'

/**
 * O mês de cada número oficial na Meta (2026-10-15): o que foi entregue e o que
 * a Meta marcou como cobrado, por categoria, e o pagamento recusado.
 *
 * A contagem é do banco (`metrics_whatsapp_cobranca`, migration
 * `20261015000002`); aqui só se monta o mapa e se converte em reais pela tabela
 * de `lib/whatsapp/cobranca`. O mês é o do fuso de SP — o da Meta é o da conta,
 * que nas clínicas daqui é o mesmo.
 */

const vazio = (): CobrancaDoNumero['porCategoria'] => ({
  marketing: { entregues: 0, cobradas: 0 },
  utility: { entregues: 0, cobradas: 0 },
  authentication: { entregues: 0, cobradas: 0 },
  service: { entregues: 0, cobradas: 0 },
})

/** Um pagamento recusado vale como aviso por uma semana (sem template entregue depois). */
const DIAS_DO_AVISO = 7

export async function getCobrancaDoWhatsapp(tenantId: string, agora = new Date()): Promise<Map<string, CobrancaDoNumero>> {
  const admin = createAdminClient()
  const inicio = startOfMonthTZ(agora)
  const [linhas, recusas] = await Promise.all([
    ler(admin.rpc('metrics_whatsapp_cobranca', {
      p_tenant: tenantId, p_from: inicio.toISOString(), p_to: addMonthsTZ(inicio, 1).toISOString(),
    }), 'contar o que a Meta cobrou no mês') as Promise<{ whatsapp_number_id: string; categoria: string; entregues: number | string; cobradas: number | string }[] | null>,
    ler(admin.rpc('whatsapp_pagamento_recusado', {
      p_tenant: tenantId, p_desde: addDaysTZ(agora, -DIAS_DO_AVISO).toISOString(),
    }), 'ler os pagamentos recusados pela Meta') as Promise<{ whatsapp_number_id: string; recusado_em: string }[] | null>,
  ])

  const porNumero = new Map<string, CobrancaDoNumero>()
  const doNumero = (id: string) => {
    let c = porNumero.get(id)
    if (!c) { c = { porCategoria: vazio(), estimativa: 0, pagamentoRecusadoEm: null }; porNumero.set(id, c) }
    return c
  }
  for (const l of linhas ?? []) {
    // Categoria que a Meta inventar depois (referral_conversion…) não tem preço aqui.
    if (!ehCategoriaDeCobranca(l.categoria)) continue
    doNumero(l.whatsapp_number_id).porCategoria[l.categoria] = {
      entregues: Number(l.entregues), cobradas: Number(l.cobradas),
    }
  }
  for (const c of porNumero.values()) {
    c.estimativa = estimarCusto((Object.keys(c.porCategoria) as CategoriaDeCobranca[])
      .map(categoria => ({ categoria, cobradas: c.porCategoria[categoria].cobradas })))
  }
  for (const r of recusas ?? []) doNumero(r.whatsapp_number_id).pagamentoRecusadoEm = r.recusado_em
  return porNumero
}
