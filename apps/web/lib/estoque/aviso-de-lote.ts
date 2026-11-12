import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import { addDaysTZ } from '@/lib/datetime'
import { notificarInteressados } from '@/lib/notifications/interessados'
import { venceAte, validadeNaTela, loteVencido } from './validade'
import { medidaNoPlural } from './medidas'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O lote que vence em 30 dias chega ao SINO (A39 da 10ª simulação,
 * 2026-11-10: aparecia no Estoque e no dashboard, e ninguém era avisado). Vai
 * para quem responde pelo Estoque na unidade do lote (a regra de partes
 * interessadas, a mesma do estoque mínimo), UMA vez por lote: o lote é
 * REIVINDICADO antes do aviso (`product_batches.vencimento_avisado_em`, C25 do
 * levantamento, F66) — perguntar "já existe aviso?" deixava duas passagens do
 * cron ao mesmo tempo avisarem duas vezes. A janela é a do cartão "Validade em 30 dias"
 * (`venceAte`, pelo DIA); o já vencido com saldo entra (é o alerta).
 *
 * `tenantId` recorta uma rede (o teste passa a `[e2e]`); o cron passa nulo.
 */
export async function avisarLotesVencendo(admin: Admin, opcoes: { tenantId?: string | null; agora?: Date; dias?: number } = {}): Promise<{ lotes: number; avisados: number }> {
  const agora = opcoes.agora ?? new Date()
  const ate = addDaysTZ(agora, opcoes.dias ?? 30)
  type Linha = {
    id: string; branch_id: string; product_id: string; batch_number: string | null; expires_at: string | null; quantity: number | string
    products: { name: string; unit: string; tenant_id: string } | null
  }
  const linhas = await lerTodas<Linha>((de, a) => {
    let q = admin.from('product_batches')
      .select('id, branch_id, product_id, batch_number, expires_at, quantity, products!inner(name, unit, tenant_id, is_active)')
      .gt('quantity', 0)
      .is('vencimento_avisado_em', null)
      .not('expires_at', 'is', null)
      // Folga de um dia: o recorte fino é pelo DIA (venceAte), abaixo.
      .lte('expires_at', addDaysTZ(ate, 1).toISOString())
      .eq('products.is_active', true)
    if (opcoes.tenantId) q = q.eq('products.tenant_id', opcoes.tenantId)
    return q.order('expires_at').order('id').range(de, a) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>
  }, 'carregar os lotes vencendo')

  let avisados = 0
  // O "em 30 dias" de cada lote é contado do dia da unidade dele (F62b).
  const vencendo: (Linha & { fuso: string })[] = []
  for (const l of linhas) {
    const fuso = await fusoDaUnidade(l.products?.tenant_id, l.branch_id)
    if (venceAte(l.expires_at, addDaysTZ(agora, opcoes.dias ?? 30, fuso), fuso)) vencendo.push({ ...l, fuso })
  }
  for (const l of vencendo) {
    // Reivindica o lote: só quem marcou a linha avisa (CLAUDE.md §14 — pegar
    // trabalho de uma fila sem reivindicar a linha executa duas vezes).
    const meu = await ler(admin.from('product_batches')
      .update({ vencimento_avisado_em: agora.toISOString() })
      .eq('id', l.id).is('vencimento_avisado_em', null)
      .select('id'), 'reivindicar o aviso do lote') as { id: string }[] | null
    if (!meu?.length) continue
    const lote = l.batch_number ? `lote ${l.batch_number}` : 'lote sem número'
    const n = Number(l.quantity)
    const qtd = n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    const medida = medidaNoPlural(l.products?.unit ?? '', n)
    // O vencido com saldo "venceu em" (princípio 3: a data passada não "vence").
    const venceu = loteVencido(l.expires_at, agora, l.fuso)
    await notificarInteressados(admin, { modulo: 'stock', branchId: l.branch_id }, {
      type:  'batch_expiring',
      title: venceu ? 'Lote vencido' : 'Lote vencendo',
      body:  `${l.products?.name ?? 'Produto'} — ${lote} ${venceu ? 'venceu em' : 'vence em'} ${validadeNaTela(l.expires_at)} (${qtd} ${medida} na unidade).`,
      data:  { lote_id: l.id, branch_id: l.branch_id, produto_id: l.product_id },
    })
    avisados++
  }
  return { lotes: vencendo.length, avisados }
}
