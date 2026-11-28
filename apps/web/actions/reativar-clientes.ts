'use server'

import { z } from 'zod'
import { getTenantContext, can, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { ehUuid } from '@/lib/id-da-rota'
import { getClientesParaReativarDoRecorte } from '@/lib/metrics/unidade'
import { fusoDaUnidade, fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import { addDaysTZ } from '@/lib/datetime'
import { diasDesdeAUltimaVisita } from '@/lib/clientes/ultima-visita'
import type { ClienteSumida } from '@/components/shared/quadros-de-clientes'

/**
 * A página seguinte do "Reativar clientes" (A18 da 43ª; indicadores:CC-06,
 * princípio 3): o "Ver mais 6 (9 no total)" levava à lista de Clientes inteira,
 * sem o recorte. Decisão do Claude, 28/11: o resto do MESMO recorte abre no
 * próprio quadro, em páginas, pela MESMA conta dos dashboards e do Copilot
 * (`getClientesParaReativarDoRecorte`).
 *
 * A trava é a do quadro (Clientes em Ver); a rede é a do contexto; a unidade da
 * tela (a do portal ou a do `?unidade=`) só dá o relógio dos dias — a cliente é
 * da rede, e a conta não estreita —, e o contexto vence o pedido
 * (`ctx.branchId ?? unidade`), conferida a rede e o alcance.
 */

const POR_PAGINA = 20

const Entrada = z.object({
  deslocamento: z.number().int().min(0).max(1_000_000),
  unidade: z.string().max(64).nullable(),
})

export async function maisClientesParaReativar(entrada: { deslocamento: number; unidade: string | null }): Promise<
  { clientes: ClienteSumida[]; total: number; error?: undefined } | { error: string }
> {
  const ctx = await getTenantContext()
  if (ctx.isClient || !ctx.tenantId || !can(ctx, 'clients', 'VIEW')) {
    return { error: 'Ver as clientes a reativar é de quem tem os Clientes em Ver.' }
  }
  const pedido = Entrada.safeParse(entrada)
  if (!pedido.success) return { error: 'Não foi possível carregar mais clientes.' }

  // A unidade da tela: o contexto vence o pedido; a pedida tem de ser da rede e estar ao alcance.
  const unidadeId = ctx.branchId ?? pedido.data.unidade
  let unidade: { id: string; name: string } | null = null
  if (unidadeId) {
    const b = ehUuid(unidadeId)
      ? await ler(createAdminClient().from('branches').select('id, name')
          .eq('tenant_id', ctx.tenantId).eq('id', unidadeId).maybeSingle(), 'conferir a unidade do quadro') as { id: string; name: string } | null
      : null
    if (!b || !alcancaUnidade(ctx, b.id)) return { error: 'Esta unidade não está entre as suas.' }
    unidade = { id: b.id, name: b.name }
  }

  // O relógio do quadro: o da unidade da tela; na rede, o da rede (como o dashboard).
  const fuso = unidade ? await fusoDaUnidade(ctx.tenantId, unidade.id) : await fusoDaRede(ctx.tenantId)
  const agora = new Date()
  const r = await getClientesParaReativarDoRecorte({
    tenantId: ctx.tenantId, unidade, desde: addDaysTZ(agora, -90, fuso),
    limite: POR_PAGINA, deslocamento: pedido.data.deslocamento,
  })
  return {
    total: r.total,
    clientes: r.lista.map(c => ({
      id: c.id, name: c.name, unidade: c.unidade, antesDoSistema: c.antesDoSistema, clienteDesde: c.clienteDesde,
      diasSemVir: diasDesdeAUltimaVisita(c.ultimaVisita, agora, fuso),
    })),
  }
}
