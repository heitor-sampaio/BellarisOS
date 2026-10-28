import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'

/**
 * ENTRADA e AJUSTE de estoque — os núcleos que a tela de estoque (actions/
 * stock.ts) e o Copilot dividem (2026-10-08). Não conferem o MÓDULO (quem
 * chama confere); conferem a rede do produto e da unidade, e a unidade ao
 * alcance de quem tem unidade fixa.
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * O produto e as unidades vieram do formulário: são desta rede?
 *
 * Sem isto, quem é da rede (`ctx.branchId` nulo — a trava de "fora da sua
 * filial" não vale para ele) gravava no produto ou na unidade de OUTRA rede.
 */
export async function produtoEUnidadesDaRede(
  admin: Admin, tenantId: string, productId: string, branchIds: string[],
): Promise<boolean> {
  const [produto, unidades] = await Promise.all([
    ler(admin.from('products').select('id').eq('id', productId).eq('tenant_id', tenantId).maybeSingle(),
      'conferir o produto'),
    ler(admin.from('branches').select('id').in('id', branchIds).eq('tenant_id', tenantId),
      'conferir as unidades'),
  ])
  return !!produto && (unidades ?? []).length === new Set(branchIds).size
}

/** As unidades por embalagem do produto (para o rendimento); null quando não usa. */
export async function getUpp(admin: Admin, productId: string): Promise<number | null> {
  const data = await ler(admin
    .from('products')
    .select('units_per_package, consumption_unit')
    .eq('id', productId)
    .maybeSingle(), 'carregar os produtos')
  if (!data?.units_per_package || !data?.consumption_unit) return null
  return Number(data.units_per_package)
}

export interface EntradaDeEstoque {
  productId: string
  branchId: string
  quantidade: number
  custoUnitario?: number | null
  observacao?: string | null
  lote?: string | null
  validade?: string | null
  /**
   * Lançar o custo (quantidade × custo da embalagem) como despesa PAGA hoje,
   * categoria Estoque — na mesma transação do movimento (`estoque_compra`).
   * A opção do cadastro do produto, também na "Entrada" (D13, 2026-10-28).
   */
  despesa?: boolean
}

export async function entradaDeEstoqueCore(admin: Admin, ctx: TenantContext, e: EntradaDeEstoque): Promise<{ ok: true; saldo: number } | { error: string }> {
  if (ctx.branchId !== null && e.branchId !== ctx.branchId) return { error: 'Operação não permitida fora da sua filial.' }
  if (!(e.quantidade > 0)) return { error: 'Quantidade deve ser maior que zero.' }
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, e.productId, [e.branchId]))) {
    return { error: 'Produto ou filial não encontrado.' }
  }

  // A despesa, quando pedida, leva o nome do produto ("Compra: …", como no cadastro).
  const lancaDespesa = !!e.despesa && (e.custoUnitario ?? 0) > 0
  const produto = lancaDespesa
    ? await ler(admin.from('products').select('name').eq('id', e.productId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o produto')
    : null

  // Numa transação só, com a linha do saldo travada (estoque_compra, sobre
  // estoque_entrada): duas entradas ao mesmo tempo (a tela e o Copilot) não se
  // perdem, e a despesa nasce com o movimento ou não nasce.
  const saldo = await gravar(admin.rpc('estoque_compra', {
    p_produto: e.productId, p_unidade: e.branchId, p_quantidade: e.quantidade,
    p_custo: e.custoUnitario ?? null, p_observacao: e.observacao ?? null,
    p_lote: e.lote || null, p_validade: e.validade || null, p_autor: ctx.internalUserId,
    p_despesa: lancaDespesa, p_descricao: `Compra: ${(produto?.name as string | undefined) ?? 'estoque'}`,
  }), 'registrar a entrada de estoque') as number
  return { ok: true, saldo: Number(saldo) }
}

export async function ajusteDeEstoqueCore(admin: Admin, ctx: TenantContext, a: {
  productId: string; branchId: string; novoSaldo: number; motivo: string
}): Promise<{ ok: true; de: number } | { error: string }> {
  if (ctx.branchId !== null && a.branchId !== ctx.branchId) return { error: 'Operação não permitida fora da sua filial.' }
  if (!a.motivo.trim()) return { error: 'Motivo do ajuste é obrigatório.' }
  if (Number.isNaN(a.novoSaldo) || a.novoSaldo < 0) return { error: 'Novo estoque não pode ser negativo.' }
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, a.productId, [a.branchId]))) {
    return { error: 'Produto ou filial não encontrado.' }
  }

  // Numa transação só, com a linha do saldo travada (estoque_ajuste).
  const anterior = await gravar(admin.rpc('estoque_ajuste', {
    p_produto: a.productId, p_unidade: a.branchId, p_novo_saldo: a.novoSaldo, p_motivo: a.motivo.trim(), p_autor: ctx.internalUserId,
  }), 'registrar o ajuste de estoque') as number
  return { ok: true, de: Number(anterior) }
}
