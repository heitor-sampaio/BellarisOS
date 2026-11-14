'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, podeReceber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/db'
import { lancamentoAoAlcance, marcarPagoCore, FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'

/**
 * A cliente da "Nova venda" do PDV (PDV2, a revisão do Heitor de 2026-11-13):
 * a busca pelo nome ou telefone, de quem recebe. A cliente é da rede (H5): a
 * busca é na rede inteira, e a venda é na unidade do PDV.
 */
export async function buscarClientesParaVender(termo: string): Promise<{
  clientes: { id: string; name: string; phone: string }[]
}> {
  const ctx = await getTenantContext()
  if (!podeReceber(ctx)) return { clientes: [] }
  const busca = typeof termo === 'string' ? termo.trim() : ''
  if (busca.length < 2) return { clientes: [] }
  const { data, error } = await createAdminClient().rpc('buscar_clientes', {
    p_tenant: ctx.tenantId!, p_termo: busca, p_limite: 10,
  })
  if (error) return { clientes: [] }
  return {
    clientes: ((data ?? []) as { id: string; name: string; phone: string | null }[])
      .map(c => ({ id: c.id, name: c.name, phone: c.phone ?? '' })),
  }
}

/**
 * Recebe no PDV a parcela do crediário (ou o a receber) que a cliente veio
 * pagar (CX1, o plano de adaptação — o Heitor, 13/11: "abrir a cliente no PDV
 * mostra as parcelas em aberto dela, e recebe-se ali"). A forma é pedida
 * SEMPRE (PDV8), e é de quem paga agora: Pix, Dinheiro, Débito ou Crédito —
 * o crediário não paga uma parcela do crediário.
 *
 * É a MESMA baixa do Financeiro (`marcarPagoCore`): confere a rede e a unidade
 * ao alcance do lançamento pelo id, e grava num UPDATE só, com a guarda do
 * já pago. Quem recebe: `podeReceber` (o Caixa ou o Financeiro em Gerenciar).
 */
export async function receberParcelaNoPdv(
  transactionId: string, slug: string,
  pagamento: { forma: string; bandeira?: string | null; vezes?: number | null; maquininha?: string | null },
): Promise<{ ok: true } | { error: string }> {
  try {
    const ctx = await getTenantContext()
    if (!podeReceber(ctx)) return { error: 'Sem permissão para receber.' }
    const forma = typeof pagamento?.forma === 'string' ? pagamento.forma : ''
    if (!forma) return { error: 'Escolha a forma de pagamento.' }
    if (!(FORMAS_DE_PAGAMENTO as readonly string[]).includes(forma)) return { error: 'Forma de pagamento inválida para receber a parcela.' }
    const { bandeira = null, vezes = null, maquininha = null } = pagamento
    if (bandeira != null && typeof bandeira !== 'string') return { error: 'Bandeira inválida.' }
    if (vezes != null && typeof vezes !== 'number') return { error: 'Vezes inválidas.' }
    if (maquininha != null && (typeof maquininha !== 'string' || !/^[0-9a-f-]{36}$/i.test(maquininha))) return { error: 'Maquininha inválida.' }
    if (typeof transactionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(transactionId)) return { error: 'Lançamento não encontrado.' }

    const admin = createAdminClient()
    // A rede e a unidade ao alcance (§11): a recepção da A não recebe na B.
    const tx = await lancamentoAoAlcance(admin, ctx, transactionId)
    if (!tx || tx.type !== 'INCOME') return { error: 'Lançamento não encontrado.' }
    const r = await marcarPagoCore(admin, ctx, transactionId, forma, bandeira, vezes, maquininha)
    if ('error' in r) return { error: r.error }

    if (typeof slug === 'string' && slug) {
      revalidatePath(`/${slug}/pdv`)
      revalidatePath(`/${slug}/financeiro`)
    }
    revalidatePath('/admin/pdv')
    revalidatePath('/admin/financeiro')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}
