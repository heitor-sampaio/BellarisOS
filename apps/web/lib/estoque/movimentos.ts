import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { saldoNaPrateleira } from '@/lib/estoque/saldo-em-texto'

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
  /** A37 da 10ª: o fornecedor e a nota fiscal da compra (informação — não gera despesa). */
  fornecedor?: string | null
  /** C76 (D4 do levantamento): o fornecedor escolhido da lista da rede — vence o texto. */
  fornecedorId?: string | null
  notaFiscal?: string | null
}

/**
 * O saldo da unidade depois do movimento, em texto, como a prateleira o mostra
 * ("Saldo agora: 10 frascos fechados + 1 aberto com 40 UI"; C16 do
 * levantamento): a entrada, o leitor e o Copilot dizem o mesmo.
 */
export async function saldoAgoraEmTexto(admin: Admin, productId: string, branchId: string): Promise<string> {
  const [p, s] = await Promise.all([
    ler(admin.from('products').select('unit, consumption_unit, units_per_package').eq('id', productId).maybeSingle(), 'ler o produto'),
    ler(admin.from('branch_product_stock').select('current_stock, current_rendimento').eq('product_id', productId).eq('branch_id', branchId).maybeSingle(), 'ler o saldo'),
  ]) as [{ unit: string; consumption_unit: string | null; units_per_package: number | null } | null, { current_stock: number; current_rendimento: number | null } | null]
  const unidade = p?.unit ?? 'un'
  const rende = p?.consumption_unit && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : 0
  if (rende > 0) {
    const rend = s?.current_rendimento != null ? Number(s.current_rendimento) : Number(s?.current_stock ?? 0) * rende
    return saldoNaPrateleira(rend, rende, unidade, p!.consumption_unit!)
  }
  return saldoNaPrateleira(Number(s?.current_stock ?? 0), 0, unidade, '')
}

export async function entradaDeEstoqueCore(admin: Admin, ctx: TenantContext, e: EntradaDeEstoque): Promise<{ ok: true; saldo: number } | { error: string }> {
  if (ctx.branchId !== null && e.branchId !== ctx.branchId) return { error: 'Operação não permitida fora da sua unidade.' }
  if (!(e.quantidade > 0)) return { error: 'Quantidade deve ser maior que zero.' }
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, e.productId, [e.branchId]))) {
    return { error: 'Produto ou unidade não encontrado.' }
  }

  // Numa transação só, com a linha do saldo travada (estoque_entrada): duas
  // entradas ao mesmo tempo (a tela e o Copilot) não se perdem mais.
  // Movimentação de estoque NUNCA gera despesa (D13 revisto, decisão do Heitor,
  // 2026-10-28): o custo fica no movimento, base do insumo, do custo e da margem.
  let fornecedor = e.fornecedor?.trim() || null
  if (e.fornecedorId) {
    if (!/^[0-9a-f-]{36}$/i.test(e.fornecedorId)) return { error: 'Fornecedor não encontrado.' }
    const f = await ler(admin.from('fornecedores').select('nome').eq('id', e.fornecedorId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'buscar o fornecedor') as { nome: string } | null
    if (!f) return { error: 'Fornecedor não encontrado.' }
    fornecedor = f.nome
  }

  const saldo = await gravar(admin.rpc('estoque_entrada', {
    p_produto: e.productId, p_unidade: e.branchId, p_quantidade: e.quantidade,
    p_custo: e.custoUnitario ?? null, p_observacao: e.observacao ?? null,
    p_lote: e.lote || null, p_validade: e.validade || null, p_autor: ctx.internalUserId,
    p_fornecedor: fornecedor, p_nota_fiscal: e.notaFiscal?.trim() || null,
  }), 'registrar a entrada de estoque') as number
  return { ok: true, saldo: Number(saldo) }
}

/**
 * O ajuste (inventário) para a CONTAGEM, exata na unidade digitada (D3 da 7ª
 * simulação; `estoque_ajuste_em`): `emConsumo` — a contagem é o rendimento
 * (765 UI); senão, em embalagens, a fração é a do frasco aberto (7,7 frascos =
 * 770 UI). Era `estoque_ajuste`, que contava o frasco aberto inteiro e tirava
 * dele o já consumido: 7,7 frascos de uma toxina com 780 UI viravam 750 UI.
 */
export async function ajusteDeEstoqueCore(admin: Admin, ctx: TenantContext, a: {
  productId: string; branchId: string; novoSaldo: number; motivo: string; emConsumo?: boolean
  /**
   * D5 da 10ª: a contagem MAIOR que o saldo entra num lote — o escolhido, ou um
   * novo "sem número" (com a validade, se vier). A MENOR sai do lote escolhido
   * (A38 da 10ª), e sem ele pelo FEFO.
   */
  loteId?: string | null; loteValidade?: string | null
}): Promise<{ ok: true; de: number } | { error: string }> {
  if (ctx.branchId !== null && a.branchId !== ctx.branchId) return { error: 'Operação não permitida fora da sua unidade.' }
  if (!a.motivo.trim()) return { error: 'Motivo do ajuste é obrigatório.' }
  if (Number.isNaN(a.novoSaldo) || a.novoSaldo < 0) return { error: 'Novo estoque não pode ser negativo.' }
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, a.productId, [a.branchId]))) {
    return { error: 'Produto ou unidade não encontrado.' }
  }

  if (a.loteId && !/^[0-9a-f-]{36}$/i.test(a.loteId)) return { error: 'Lote não encontrado nesta unidade.' }
  if (a.loteValidade && !/^\d{4}-\d{2}-\d{2}$/.test(a.loteValidade)) return { error: 'Validade do lote ilegível.' }

  // Numa transação só, com a linha do saldo travada (estoque_ajuste_com_lote:
  // a contagem exata, e o que sobra entra num lote — D5 da 10ª).
  const anterior = await gravar(admin.rpc('estoque_ajuste_com_lote', {
    p_produto: a.productId, p_unidade: a.branchId, p_contagem: a.novoSaldo, p_em_consumo: !!a.emConsumo,
    p_motivo: a.motivo.trim(), p_autor: ctx.internalUserId,
    p_lote: a.loteId || null, p_lote_numero: null, p_lote_validade: a.loteValidade || null,
  }), 'registrar o ajuste de estoque') as number
  return { ok: true, de: Number(anterior) }
}
