import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { contar, lerTodas } from '@/lib/db'
import { addDaysTZ } from '@/lib/datetime'
import { notificarInteressados } from '@/lib/notifications/interessados'
import { venceAte, validadeNaTela } from './validade'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O lote que vence em 30 dias chega ao SINO (A39 da 10ª simulação,
 * 2026-11-10: aparecia no Estoque e no dashboard, e ninguém era avisado). Vai
 * para quem responde pelo Estoque na unidade do lote (a regra de partes
 * interessadas, a mesma do estoque mínimo), UMA vez por lote — a repetição se
 * evita perguntando se já existe aviso com o id daquele lote, como o mínimo
 * faz com o id do evento. A janela é a do cartão "Validade em 30 dias"
 * (`venceAte`, pelo DIA); o já vencido com saldo entra (é o alerta).
 *
 * `tenantId` recorta uma rede (o teste passa a `[e2e]`); o cron passa nulo.
 */
export async function avisarLotesVencendo(admin: Admin, opcoes: { tenantId?: string | null; agora?: Date; dias?: number } = {}): Promise<{ lotes: number; avisados: number }> {
  const agora = opcoes.agora ?? new Date()
  const ate = addDaysTZ(agora, opcoes.dias ?? 30)
  type Linha = {
    id: string; branch_id: string; batch_number: string | null; expires_at: string | null; quantity: number | string
    products: { name: string; unit: string; tenant_id: string } | null
  }
  const linhas = await lerTodas<Linha>((de, a) => {
    let q = admin.from('product_batches')
      .select('id, branch_id, batch_number, expires_at, quantity, products!inner(name, unit, tenant_id, is_active)')
      .gt('quantity', 0)
      .not('expires_at', 'is', null)
      // Folga de um dia: o recorte fino é pelo DIA (venceAte), abaixo.
      .lte('expires_at', addDaysTZ(ate, 1).toISOString())
      .eq('products.is_active', true)
    if (opcoes.tenantId) q = q.eq('products.tenant_id', opcoes.tenantId)
    return q.order('expires_at').order('id').range(de, a) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>
  }, 'carregar os lotes vencendo')

  let avisados = 0
  // O "em 30 dias" de cada lote é contado do dia da unidade dele (F62b).
  const vencendo: Linha[] = []
  for (const l of linhas) {
    const fuso = await fusoDaUnidade(l.products?.tenant_id, l.branch_id)
    if (venceAte(l.expires_at, addDaysTZ(agora, opcoes.dias ?? 30, fuso), fuso)) vencendo.push(l)
  }
  for (const l of vencendo) {
    const ja = await contar(admin.from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'batch_expiring')
      .filter('data->>lote_id', 'eq', l.id), 'conferir se o aviso do lote já saiu')
    if (ja > 0) continue
    const lote = l.batch_number ? `lote ${l.batch_number}` : 'lote sem número'
    const qtd = Number(l.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    await notificarInteressados(admin, { modulo: 'stock', branchId: l.branch_id }, {
      type:  'batch_expiring',
      title: 'Lote vencendo',
      body:  `${l.products?.name ?? 'Produto'} — ${lote} vence em ${validadeNaTela(l.expires_at)} (${qtd} ${l.products?.unit ?? ''} na unidade).`,
      data:  { lote_id: l.id, branch_id: l.branch_id, produto_id: null },
    })
    avisados++
  }
  return { lotes: vencendo.length, avisados }
}
