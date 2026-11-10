'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getTenantContext, assertPermission, alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, lerTodas, tentar, mensagemDoErro } from '@/lib/db'
import { umaVez, chaveDoEnvio } from '@/lib/envio-unico'
import { ajusteDeEstoqueCore, entradaDeEstoqueCore, produtoEUnidadesDaRede } from '@/lib/estoque/movimentos'
import { lerUso, type UsoDoProduto } from '@/lib/estoque/uso'
import { prefixoDoSku } from '@/lib/estoque/sku'
import { lerMotivoDaPerda, rotuloDoMotivo } from '@/lib/estoque/perda'
import { comissaoDoProdutoNoFormulario } from '@/lib/comissoes/gravacao'
import { aplicacoesDoLote as aplicacoesDoLoteCore, type AplicacaoDoLote } from '@/lib/estoque/aplicacoes-do-lote'
import { unidadeDoInsumo, type UnidadesDoProduto } from '@/lib/estoque/unidade-de-consumo'
import { notaDaTransferencia, notaDeTransferenciaSemNome } from '@/lib/estoque/transferencia'

function str(fd: FormData, key: string) {
  return (fd.get(key) as string | null)?.trim() || null
}

async function nextSku(tenantId: string, category: string | null, uso: UsoDoProduto | null = null): Promise<string> {
  const admin  = createAdminClient()
  // A6 da 7ª simulação: sem categoria, o que se vende não segue a sequência dos insumos.
  const prefix = prefixoDoSku(category, uso)

  const data = await ler(admin
    .from('products')
    .select('sku')
    .eq('tenant_id', tenantId)
    .like('sku', `${prefix}-%`), 'carregar os produtos')

  const maxNum = (data ?? []).reduce((max, p) => {
    const seq = parseInt((p.sku ?? '').split('-').pop() ?? '0', 10)
    return isNaN(seq) ? max : Math.max(max, seq)
  }, 0)

  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key)
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? null : n
}

// --- Catálogo de produtos ------------------------------------------

/**
 * O uso do produto e o preço de venda (D-6): a revenda (e "os dois") precisa
 * de preço — não haveria por quanto vender; o insumo grava o preço nulo. Sem o
 * campo (um chamador antigo), vale o preço de venda: com ele, os dois.
 */
function usoEPrecoDoFormulario(fd: FormData): { uso: UsoDoProduto; preco: number | null } | { error: string } {
  const preco = num(fd, 'sale_price')
  const pedido = str(fd, 'uso')
  const uso = pedido == null ? (preco != null ? 'AMBOS' : 'INSUMO') : lerUso(pedido)
  if (!uso) return { error: 'Uso do produto inválido.' }
  if (uso === 'INSUMO') return { uso, preco: null }
  if (preco == null || !(preco > 0)) return { error: 'Informe o preço de venda: o produto de revenda é vendido por ele.' }
  return { uso, preco }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function createProduct(
  ...args: Parameters<typeof createProductInterno>
): ReturnType<typeof createProductInterno> {
  try {
    return await createProductInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function createProductInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const name = str(formData, 'name')
    if (!name) return { error: 'Nome é obrigatório.' }
    const unit = str(formData, 'unit')
    if (!unit) return { error: 'Unidade é obrigatória.' }

    const usoEPreco = usoEPrecoDoFormulario(formData)
    if ('error' in usoEPreco) return { error: usoEPreco.error }
    // A comissão de venda do produto, registrada no cadastro (o Heitor, 03/11):
    // conferida ANTES de gravar — quem não muda comissão é recusado inteiro.
    const comissao = comissaoDoProdutoNoFormulario(ctx, formData)
    if (comissao.error) return { error: comissao.error }

    const categoryId = str(formData, 'category_id')
    const admin = createAdminClient()

    // Resolve o nome da categoria para geração do SKU e campo denormalizado
    let categoryName: string | null = null
    if (categoryId) {
      const cat = await ler(admin.from('product_categories').select('name').eq('id', categoryId).single(), 'buscar a categoria')
      categoryName = cat?.name ?? null
    }

    // A unidade do estoque inicial vem do formulário: da rede e ao alcance de
    // quem cria (§11). Até 2026-09-28 ia direto para o saldo, o movimento e a
    // DESPESA — inclusive numa unidade de outra clínica. Conferida antes de o
    // produto nascer, para a recusa não deixar um produto sem estoque para trás.
    const filialPedida = str(formData, '_branchId')
    if (filialPedida) {
      const daRede = await ler(admin.from('branches').select('id')
        .eq('id', filialPedida).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
      if (!daRede || !alcancaUnidade(ctx, filialPedida)) return { error: 'Unidade não encontrada.' }
    }

    // Estoque inicial.
    //
    // A unidade vem do formulário, não do contexto: quem é da REDE não tem
    // `ctx.branchId`, e a condição antiga (`&& ctx.branchId`) descartava tudo em
    // silêncio — o produto nascia sem movimento, sem saldo na filial, sem lote e
    // sem a despesa, com a tela dizendo que deu certo. O modal pede a unidade
    // quando quem cria é da rede; na unidade ela já vem do contexto (ou da tela).
    // Tudo conferido ANTES de o produto nascer (D8 da 9ª simulação: a recusa
    // vinha depois do insert, e repetir criava o OUT-002).
    const initialQty    = num(formData, 'initial_qty')
    const initialCost   = num(formData, 'initial_cost')
    const filialEstoque = str(formData, '_branchId') || ctx.branchId
    const comEstoque    = !!initialQty && initialQty > 0
    if (comEstoque && !filialEstoque) return { error: 'Escolha a unidade que vai receber o estoque inicial.' }
    if (comEstoque && ctx.branchId !== null && filialEstoque !== ctx.branchId) return { error: 'O estoque inicial é só da sua unidade.' }

    // O nome repetido AVISA, sem recusar (A6 da 9ª; princípio 2): dois "Manta
    // térmica" iguais apareciam em dobro no seletor de insumo, sem nada que os
    // distinguisse. Confirmado, cadastra.
    if (formData.get('_nomeRepetido') !== 'sim') {
      const mesmos = await ler(admin.from('products').select('name, sku')
        .eq('tenant_id', ctx.tenantId!).eq('is_active', true).ilike('name', name.replace(/[%_\\]/g, '\\$&')).limit(3),
      'conferir o nome do produto') as { name: string; sku: string | null }[] | null
      if (mesmos?.length) {
        const skus = mesmos.map(m => m.sku).filter(Boolean).join(', ')
        return { pergunta: `Já existe o produto “${mesmos[0]!.name}”${skus ? ` (${skus})` : ''}. Cadastrar outro com o mesmo nome? O SKU os diferencia no seletor de insumo.` }
      }
    }

    const sku = await nextSku(ctx.tenantId!, categoryName, usoEPreco.uso)

    const minStock = num(formData, 'min_stock') ?? 0

    const { data: newProduct, error } = await admin.from('products').insert({
      tenant_id:   ctx.tenantId!,
      name,
      sku,
      category:    categoryName,
      category_id: categoryId,
      unit,
      supplier:    str(formData, 'supplier'),
      barcode:           str(formData, 'barcode'),
      cost_price:        num(formData, 'cost_price'),
      sale_price:        usoEPreco.preco,
      uso:               usoEPreco.uso,
      min_stock:         minStock,
      consumption_unit:  str(formData, 'consumption_unit'),
      units_per_package: num(formData, 'units_per_package'),
      ...(comissao.patch ?? {}),
    }).select('id').single()

    if (error) return { error: error.message }

    if (comEstoque && filialEstoque && newProduct) {
      // Numa transação só (estoque_inicial, sobre estoque_entrada — 2026-10-21):
      // movimento, saldo com o mínimo, lote e custo. Eram quatro gravações
      // soltas. Sem despesa: movimentação de estoque nunca gera despesa (D13
      // revisto, decisão do Heitor, 2026-10-28). Se o estoque não entra, o
      // produto recém-nascido sai (sem movimento nenhum): nada pela metade (D8 da 9ª).
      const desfazer = () => tentar(admin.from('products').delete().eq('id', newProduct.id).eq('tenant_id', ctx.tenantId!), 'desfazer o produto sem o estoque inicial')
      const unidadeDaRede = await produtoEUnidadesDaRede(admin, ctx.tenantId!, newProduct.id, [filialEstoque])
      if (!unidadeDaRede) { await desfazer(); return { error: 'A unidade do estoque inicial não é desta rede.' } }
      try {
        await gravar(admin.rpc('estoque_inicial', {
          p_produto: newProduct.id, p_unidade: filialEstoque, p_quantidade: initialQty,
          p_custo: initialCost && initialCost > 0 ? initialCost : null,
          p_observacao: str(formData, 'initial_notes') ?? 'Estoque inicial',
          p_lote: str(formData, 'initial_batch'), p_validade: str(formData, 'initial_expires_at'),
          p_autor: ctx.internalUserId, p_minimo: minStock,
        }), 'registrar o estoque inicial')
      } catch (e) {
        await desfazer()
        return { error: `O produto não foi criado: o estoque inicial não entrou (${mensagemDoErro(e)}).` }
      }
    }

    revalidatePath('/admin/produtos')
    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    // updateTag, não revalidateTag 'max': o 'max' serve a lista velha mais uma vez,
    // e o produto recém-criado não aparecia no "Novo procedimento" nem no
    // atendimento (simulação de 2026-10-20).
    revalidateTag(`products:${ctx.tenantId!}`, { expire: 0 })
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

export async function updateProduct(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const productId = str(formData, '_productId')
    if (!productId) return { error: 'Produto não identificado.' }

    const name = str(formData, 'name')
    if (!name) return { error: 'Nome é obrigatório.' }
    const unit = str(formData, 'unit')
    if (!unit) return { error: 'Unidade é obrigatória.' }

    const usoEPreco = usoEPrecoDoFormulario(formData)
    if ('error' in usoEPreco) return { error: usoEPreco.error }
    // A comissão de venda do produto (o Heitor, 03/11), conferida antes de gravar.
    const comissao = comissaoDoProdutoNoFormulario(ctx, formData)
    if (comissao.error) return { error: comissao.error }

    const categoryId = str(formData, 'category_id')
    const admin = createAdminClient()

    let categoryName: string | null = null
    if (categoryId) {
      const cat = await ler(admin.from('product_categories').select('name').eq('id', categoryId).single(), 'buscar a categoria')
      categoryName = cat?.name ?? null
    }

    // Preserva SKU existente; gera novo somente se ainda não tem e uma categoria foi definida
    const current = await ler(admin.from('products').select('sku').eq('id', productId).single(), 'buscar o produto')
    let sku = current?.sku ?? null
    if (!sku && categoryName) {
      sku = await nextSku(ctx.tenantId!, categoryName)
    }

    const { error } = await admin.from('products')
      .update({
        name,
        sku,
        category:    categoryName,
        category_id: categoryId,
        unit,
        supplier:    str(formData, 'supplier'),
        barcode:           str(formData, 'barcode'),
        cost_price:        num(formData, 'cost_price'),
        sale_price:        usoEPreco.preco,
        uso:               usoEPreco.uso,
        min_stock:         num(formData, 'min_stock') ?? 0,
        consumption_unit:  str(formData, 'consumption_unit'),
        units_per_package: num(formData, 'units_per_package'),
        ...(comissao.patch ?? {}),
        updated_at:        new Date().toISOString(),
      })
      .eq('id', productId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) return { error: error.message }

    revalidatePath('/admin/produtos')
    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    // updateTag, não revalidateTag 'max': o 'max' serve a lista velha mais uma vez,
    // e o produto recém-criado não aparecia no "Novo procedimento" nem no
    // atendimento (simulação de 2026-10-20).
    revalidateTag(`products:${ctx.tenantId!}`, { expire: 0 })
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

export async function findProductByBarcode(barcode: string) {
  try {
    const ctx = await getTenantContext()
    const admin = createAdminClient()

    const data = await ler(admin
      .from('products')
      .select('id, name, unit, cost_price, consumption_unit, units_per_package, sku, category, barcode')
      .eq('tenant_id', ctx.tenantId!)
      .eq('barcode', barcode.trim())
      .eq('is_active', true)
      .maybeSingle(), 'buscar o produto')

    if (!data) return { error: 'Nenhum produto encontrado com este código.' }
    return { product: data }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function toggleProductActive(
  ...args: Parameters<typeof toggleProductActiveInterno>
): ReturnType<typeof toggleProductActiveInterno> {
  try {
    return await toggleProductActiveInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function toggleProductActiveInterno(productId: string, isActive: boolean) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const admin = createAdminClient()
    await gravar(admin.from('products')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('tenant_id', ctx.tenantId!), 'mudar a situação do produto')

    revalidatePath('/admin/produtos')
    // updateTag, não revalidateTag 'max': o 'max' serve a lista velha mais uma vez,
    // e o produto recém-criado não aparecia no "Novo procedimento" nem no
    // atendimento (simulação de 2026-10-20).
    revalidateTag(`products:${ctx.tenantId!}`, { expire: 0 })
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Categorias de produto ---------------------------------------

export async function createCategory(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const name = (formData.get('name') as string | null)?.trim()
    if (!name) return { error: 'Nome é obrigatório.' }

    const admin = createAdminClient()
    const { error } = await admin.from('product_categories').insert({
      tenant_id: ctx.tenantId!,
      name,
    })

    if (error) {
      if (error.code === '23505') return { error: 'Já existe uma categoria com esse nome.' }
      return { error: error.message }
    }

    revalidatePath('/admin/estoque')
    revalidatePath('/*/stock')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

export async function deleteCategory(categoryId: string) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const admin = createAdminClient()
    const { error } = await admin.from('product_categories')
      .delete()
      .eq('id', categoryId)
      .eq('tenant_id', ctx.tenantId!)

    if (error) return { error: error.message }

    revalidatePath('/admin/estoque')
    revalidatePath('/*/stock')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Estoque por filial -------------------------------------------

// `createStockMovement` e `updateBranchMinStock` foram removidas: as operações
// de estoque passaram todas pelo modal de gerenciar (adminAddStock,
// adminTransferStock, adminAdjustStock, adminUpdateMinStock), que os dois
// portais usam. Ficaram sem chamador quando a filial adotou esse modal, e
// todo export de um arquivo `use server` é um endpoint público.

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function adminUpdateMinStock(
  ...args: Parameters<typeof adminUpdateMinStockInterno>
): ReturnType<typeof adminUpdateMinStockInterno> {
  try {
    return await adminUpdateMinStockInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function adminUpdateMinStockInterno(productId: string, branchId: string, minStock: number) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')
    if (ctx.branchId !== null && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua unidade.' }

    const admin = createAdminClient()
    if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, productId, [branchId])))
      return { error: 'Produto ou unidade não encontrado.' }
    await gravar(admin.from('branch_product_stock').upsert({
      product_id: productId,
      branch_id:  branchId,
      min_stock:  minStock,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id,branch_id' }), 'salvar o estoque mínimo')

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

// --- Gestão de estoque (NETWORK_ADMIN) ---------------------------

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function adminAddStock(
  ...args: Parameters<typeof adminAddStockInterno>
): ReturnType<typeof adminAddStockInterno> {
  try {
    // O mesmo envio (a chave da tela) entra UMA vez (D10, lib/envio-unico.ts).
    const ctx = await getTenantContext()
    return await umaVez(ctx.tenantId!, 'adminAddStock', chaveDoEnvio(args[1]), () => adminAddStockInterno(...args),
      { gravou: r => !!r.success })
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function adminAddStockInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const productId = str(formData, 'productId')
    const branchId  = str(formData, 'branchId')
    if (!productId) return { error: 'Produto não identificado.' }
    if (!branchId)  return { error: 'Selecione uma unidade.' }
    if (ctx.branchId !== null && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua unidade.' }

    const qtyRaw = str(formData, 'quantity')
    if (!qtyRaw) return { error: 'Quantidade é obrigatória.' }
    const qty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return { error: 'Quantidade deve ser maior que zero.' }

    // O núcleo (lib/estoque/movimentos.ts) é o mesmo do Copilot.
    const r = await entradaDeEstoqueCore(createAdminClient(), ctx, {
      productId, branchId, quantidade: qty,
      custoUnitario: num(formData, 'unit_cost'),
      observacao:    str(formData, 'notes'),
      lote:          str(formData, 'batch_number'),
      validade:      str(formData, 'expires_at'),
      // A37 da 10ª: o fornecedor e a nota da compra, estruturados.
      fornecedor:    str(formData, 'fornecedor'),
      notaFiscal:    str(formData, 'nota_fiscal'),
    })
    if ('error' in r) return { error: r.error }

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function adminTransferStock(
  ...args: Parameters<typeof adminTransferStockInterno>
): ReturnType<typeof adminTransferStockInterno> {
  try {
    // O mesmo envio (a chave da tela) transfere UMA vez (D10, lib/envio-unico.ts).
    const ctx = await getTenantContext()
    return await umaVez(ctx.tenantId!, 'adminTransferStock', chaveDoEnvio(args[1]), () => adminTransferStockInterno(...args),
      { gravou: r => !!r.success })
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function adminTransferStockInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; saldos?: { origem: number; destino: number } }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const productId    = str(formData, 'productId')
    const fromBranchId = str(formData, 'fromBranchId')
    const toBranchId   = str(formData, 'toBranchId')
    if (!productId)    return { error: 'Produto não identificado.' }
    if (!fromBranchId) return { error: 'Selecione a unidade de origem.' }
    if (!toBranchId)   return { error: 'Selecione a unidade de destino.' }
    if (fromBranchId === toBranchId) return { error: 'Origem e destino devem ser unidades diferentes.' }

    const qtyRaw = str(formData, 'quantity')
    if (!qtyRaw) return { error: 'Quantidade é obrigatória.' }
    const qty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(qty) || qty <= 0) return { error: 'Quantidade deve ser maior que zero.' }

    const notes = str(formData, 'notes')
    if (ctx.branchId !== null && fromBranchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua unidade.' }
    const admin = createAdminClient()
    if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, productId, [fromBranchId, toBranchId])))
      return { error: 'Produto ou unidade não encontrado.' }

    // As duas pernas, os dois saldos e o rendimento numa transação, com as
    // linhas travadas (estoque_transferir, 2026-10-08). Era ler os dois saldos
    // aqui e gravar os valores absolutos: duas transferências ao mesmo tempo
    // (ou uma transferência e uma conclusão) perdiam uma. O "estoque
    // insuficiente" também é conferido lá dentro, com a linha travada.
    const { data: saldos, error } = await admin.rpc('estoque_transferir', {
      p_produto: productId, p_origem: fromBranchId, p_destino: toBranchId,
      p_quantidade: qty, p_observacao: notes ?? null, p_autor: ctx.internalUserId,
    })
    if (error) {
      if (error.code === 'P0001') return { error: error.message }
      throw new Error(`Não consegui transferir: ${error.message}`)
    }

    revalidatePath('/admin/estoque')
    // A16 da 8ª simulação: os saldos DEPOIS (o da função, com as linhas
    // travadas) — a gerente de unidade fixa não vê o estoque do destino.
    const s = saldos as { origem?: number; destino?: number } | null
    return { success: true, saldos: { origem: Number(s?.origem ?? 0), destino: Number(s?.destino ?? 0) } }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function adminAdjustStock(
  ...args: Parameters<typeof adminAdjustStockInterno>
): ReturnType<typeof adminAdjustStockInterno> {
  try {
    return await adminAdjustStockInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function adminAdjustStockInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')

    const productId = str(formData, 'productId')
    const branchId  = str(formData, 'branchId')
    if (!productId) return { error: 'Produto não identificado.' }
    if (!branchId)  return { error: 'Selecione uma unidade.' }
    if (ctx.branchId !== null && branchId !== ctx.branchId)
      return { error: 'Operação não permitida fora da sua unidade.' }

    const reason = str(formData, 'reason')
    if (!reason) return { error: 'Motivo do ajuste é obrigatório.' }

    const qtyRaw = (formData.get('new_quantity') as string | null)?.trim()
    if (!qtyRaw) return { error: 'Novo estoque é obrigatório.' }
    const newQty = parseFloat(qtyRaw.replace(',', '.'))
    if (isNaN(newQty) || newQty < 0) return { error: 'Novo estoque não pode ser negativo.' }
    // D3 da 7ª: a contagem na unidade de consumo (UI) ou em embalagens (a fração é o frasco aberto).
    const emConsumo = str(formData, 'unidade') === 'CONSUMO'

    // O núcleo (lib/estoque/movimentos.ts) é o mesmo do Copilot.
    // D5 da 10ª: o que a contagem achou a mais entra num lote (o escolhido, ou um novo sem número).
    const r = await ajusteDeEstoqueCore(createAdminClient(), ctx, {
      productId, branchId, novoSaldo: newQty, motivo: reason, emConsumo,
      loteId: str(formData, 'loteId'), loteValidade: str(formData, 'lote_validade'),
    })
    if ('error' in r) return { error: r.error }

    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath(`/*/stock`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

/**
 * A saída por PERDA (D-7, decisão do Heitor, 2026-10-29): pelo lote escolhido
 * (ou, sem lote, o que vence primeiro), com o motivo, e SEM despesa — uma
 * transação (`estoque_perda`, a linha do saldo travada; recusa mais do que há
 * ou do que o lote tem). A quantidade é em embalagens, como a entrada e o
 * ajuste — ou, com `unidade = CONSUMO`, na unidade de consumo do produto
 * (est-03: "30 UI" do frasco aberto, sem a conta de cabeça; `estoque_perda_em`).
 */
export async function registrarPerda(
  ...args: Parameters<typeof registrarPerdaInterno>
): ReturnType<typeof registrarPerdaInterno> {
  try {
    // O mesmo envio (a chave da tela) baixa UMA vez (D10, lib/envio-unico.ts).
    const ctx = await getTenantContext()
    return await umaVez(ctx.tenantId!, 'registrarPerda', chaveDoEnvio(args[1]), () => registrarPerdaInterno(...args),
      { gravou: r => !!r.success })
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function registrarPerdaInterno(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'stock', 'MANAGE')

  const productId = str(formData, 'productId')
  const branchId  = str(formData, 'branchId')
  const loteId    = str(formData, 'loteId')
  if (!productId) return { error: 'Produto não identificado.' }
  if (!branchId)  return { error: 'Selecione uma unidade.' }
  if (!alcancaUnidade(ctx, branchId)) return { error: 'Operação não permitida fora da sua unidade.' }
  const motivo = lerMotivoDaPerda(str(formData, 'motivo'))
  if (!motivo) return { error: 'Escolha o motivo da perda.' }
  const qtd = num(formData, 'quantity')
  if (qtd == null || !(qtd > 0)) return { error: 'Quantidade deve ser maior que zero.' }

  const admin = createAdminClient()
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, productId, [branchId])))
    return { error: 'Produto ou unidade não encontrado.' }

  const { error } = await admin.rpc('estoque_perda_em', {
    p_produto: productId, p_unidade: branchId, p_lote: loteId, p_quantidade: qtd,
    p_em_consumo: str(formData, 'unidade') === 'CONSUMO',
    p_motivo: motivo, p_observacao: str(formData, 'notes'), p_autor: ctx.internalUserId,
  })
  if (error) {
    if (error.code === 'P0001') return { error: error.message }
    throw new Error(`Não consegui registrar a perda: ${error.message}`)
  }

  revalidatePath('/admin/estoque')
  revalidatePath('/[slug]/estoque', 'page')
  return { success: true }
}

export interface MovimentoDeEstoque {
  id:           string
  type:         string
  quantity:     number
  balanceAfter: number
  notes:        string | null
  createdAt:    string
  branchName:   string
  /** A unidade do movimento: a de CONSUMO quando o produto tem (ml, UI), senão a embalagem. */
  unidade:      string
  /** Quanto uma embalagem rende, quando o produto conta em consumo — para a equivalência. */
  porEmbalagem: number | null
  /** O nome da embalagem (frasco), para a equivalência. */
  embalagem:    string
  /** O saldo depois, em embalagens (4,95 frascos) — só quando o produto conta em consumo. */
  saldoEmEmbalagens: number | null
  /**
   * O movimento em embalagens (−32 UI = −0,32 frasco; +300 UI = +3 frasco) —
   * só quando o produto conta em consumo (J-44: o histórico dizia "−1 ml" e a
   * pessoa pensava na seringa).
   */
  emEmbalagens: number | null
  /** O custo de UMA unidade de consumo gravado no movimento (R$ 6,50 a UI). */
  custoUnitario: number | null
  /** O custo de UMA embalagem (o de consumo × o rendimento): R$ 650 o frasco. */
  custoPorEmbalagem: number | null
  /** Os lotes do movimento (de onde saiu, ou o que a entrada criou) — J-45. */
  lotes: { numero: string | null; validade: string | null }[]
  /** A37 da 10ª: o fornecedor e a nota fiscal da entrada. */
  fornecedor: string | null
  notaFiscal: string | null
  /** A38 da 10ª: a entrada desfeita (quando e por quê). */
  desfeita: { em: string; motivo: string | null } | null
  /**
   * A entrada ainda se desfaz: o lote dela não teve saída (ou, sem lote, o
   * produto não tem lote com saldo na unidade). O banco confere de novo
   * (estoque_desfazer_entrada).
   */
  desfazivel: boolean
}

/**
 * Histórico de movimentações de um produto.
 *
 * `branchId` vazio = todas as unidades, que é o que o portal da rede pede: de
 * onde saiu e para onde entrou, numa lista só. Não havia caminho nenhum para
 * isto na interface — dava para movimentar sem nunca ver o que já tinha sido
 * movimentado.
 */
export async function getProductMovements(
  productId: string,
  branchId: string,
): Promise<MovimentoDeEstoque[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'stock', 'VIEW')

  const admin = createAdminClient()
  let query = admin
    .from('stock_movements')
    .select('id, type, quantity, balance_after, notes, reference, created_at, unit_cost, motivo_da_perda, fornecedor, nota_fiscal, desfeita_em, desfeita_motivo, branch_id, branches!inner(name, tenant_id), stock_movement_batches(quantity, product_batches(id, batch_number, expires_at, quantity))')
    .eq('product_id', productId)
    .eq('branches.tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false })
    .limit(80)

  // Quem tem unidade fixa só vê a dela — qualquer que seja o pedido; a rede vê
  // todas. Antes o `branchId` do chamador vencia o do contexto.
  const recorte = ctx.branchId ?? branchId
  if (recorte) query = query.eq('branch_id', recorte)

  const [{ data, error }, produto] = await Promise.all([
    query,
    ler(admin.from('products').select('unit, consumption_unit, units_per_package')
      .eq('id', productId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'carregar o produto'),
  ])
  // Histórico vazio é um fato; histórico que falhou é outra coisa.
  if (error) throw new Error(`Não foi possível carregar o histórico: ${error.message}`)

  // Todo movimento está na unidade de CONSUMO desde 2026-10-27 (a entrada de
  // 5 frascos de 100 ml grava 500 ml). A regra de "conta em consumo" é a de
  // tem_unidade_de_consumo no banco.
  const upp       = Number(produto?.units_per_package ?? 0)
  const consumo   = (produto?.consumption_unit as string | null)?.trim() || null
  const emConsumo = upp > 0 && !!consumo
  const embalagem = (produto?.unit as string | null) ?? ''

  type Row = {
    id: string; type: string; quantity: number; balance_after: number
    notes: string | null; reference: string | null; created_at: string; branches: { name: string } | null
    unit_cost: number | string | null
    motivo_da_perda: string | null
    fornecedor: string | null; nota_fiscal: string | null; desfeita_em: string | null; desfeita_motivo: string | null
    branch_id: string
    stock_movement_batches: { quantity: number | string; product_batches: { id: string; batch_number: string | null; expires_at: string | null; quantity: number | string } | null }[] | null
  }
  const fator = emConsumo ? upp : 1
  const linhas = (data ?? []) as unknown as Row[]

  // D12 da 8ª: a nota antiga da transferência ("→ destino", "← origem") ganha o
  // nome da unidade da OUTRA perna, pela mesma `reference`. As novas já nascem com ele.
  const refs = [...new Set(linhas.filter(m => m.reference && notaDeTransferenciaSemNome(m.type, m.notes)).map(m => m.reference!))]
  const outraPerna = new Map<string, string>()
  if (refs.length) {
    const pernas = await ler(admin.from('stock_movements').select('type, reference, branches!inner(name, tenant_id)')
      .eq('product_id', productId).eq('branches.tenant_id', ctx.tenantId!).in('reference', refs), 'ler as transferências') as
      { type: string; reference: string; branches: { name: string } | null }[] | null
    for (const x of pernas ?? []) outraPerna.set(`${x.reference}|${x.type}`, x.branches?.name ?? '')
  }
  // A38 da 10ª: a entrada se desfaz enquanto o lote dela não teve saída — só a
  // ligação da própria entrada, com a quantidade inteira. Sem lote, só quando o
  // produto não tem lote com saldo na unidade (o gatilho tiraria de outro).
  const entradas = linhas.filter(m => m.type === 'PURCHASE' && Number(m.quantity) > 0 && !m.desfeita_em)
  const lotesDasEntradas = [...new Set(entradas.flatMap(m => (m.stock_movement_batches ?? []).map(l => l.product_batches?.id).filter(Boolean) as string[]))]
  const ligacoesDosLotes = new Map<string, number>()
  if (lotesDasEntradas.length) {
    const ligs = await ler(admin.from('stock_movement_batches').select('batch_id').in('batch_id', lotesDasEntradas), 'conferir as saídas dos lotes') as { batch_id: string }[] | null
    for (const l of ligs ?? []) ligacoesDosLotes.set(l.batch_id, (ligacoesDosLotes.get(l.batch_id) ?? 0) + 1)
  }
  const unidadesSemLote = [...new Set(entradas.filter(m => !(m.stock_movement_batches ?? []).length).map(m => m.branch_id))]
  const unidadesComLote = new Set<string>()
  if (unidadesSemLote.length) {
    const comSaldo = await ler(admin.from('product_batches').select('branch_id').eq('product_id', productId)
      .in('branch_id', unidadesSemLote).gt('quantity', 0), 'conferir os lotes com saldo') as { branch_id: string }[] | null
    for (const l of comSaldo ?? []) unidadesComLote.add(l.branch_id)
  }
  const desfazivel = (m: Row) => {
    if (m.type !== 'PURCHASE' || !(Number(m.quantity) > 0) || m.desfeita_em) return false
    const ligs = m.stock_movement_batches ?? []
    if (!ligs.length) return !unidadesComLote.has(m.branch_id)
    const l = ligs[0]!
    const lote = l.product_batches
    return !!lote && ligacoesDosLotes.get(lote.id) === 1 && Math.abs(Number(lote.quantity) - Number(l.quantity)) < 1e-6
  }
  const nota = (m: Row) => {
    if (!m.reference || !notaDeTransferenciaSemNome(m.type, m.notes)) return m.notes
    const outra = outraPerna.get(`${m.reference}|${m.type === 'TRANSFER_OUT' ? 'TRANSFER_IN' : 'TRANSFER_OUT'}`) || null
    return notaDaTransferencia(m.type, m.notes, outra)
  }
  return linhas.map(m => ({
    id:           m.id,
    type:         m.type,
    quantity:     Number(m.quantity),
    balanceAfter: Number(m.balance_after),
    // A perda diz o motivo antes da observação (D-7): "Vencido · frasco aberto".
    notes:        m.motivo_da_perda ? [rotuloDoMotivo(m.motivo_da_perda), m.notes].filter(Boolean).join(' · ') : nota(m),
    createdAt:    m.created_at,
    branchName:   m.branches?.name ?? '—',
    unidade:      emConsumo ? consumo! : embalagem,
    porEmbalagem: emConsumo ? upp : null,
    embalagem,
    saldoEmEmbalagens: emConsumo ? Math.round(Number(m.balance_after) / upp * 100) / 100 : null,
    emEmbalagens: emConsumo ? Math.round(Number(m.quantity) / upp * 100) / 100 : null,
    custoUnitario: m.unit_cost != null ? Number(m.unit_cost) : null,
    custoPorEmbalagem: m.unit_cost != null ? Math.round(Number(m.unit_cost) * fator * 100) / 100 : null,
    lotes: (m.stock_movement_batches ?? []).flatMap(l => l.product_batches
      ? [{ numero: l.product_batches.batch_number, validade: l.product_batches.expires_at }] : []),
    fornecedor:   m.fornecedor,
    notaFiscal:   m.nota_fiscal,
    desfeita:     m.desfeita_em ? { em: m.desfeita_em, motivo: m.desfeita_motivo } : null,
    desfazivel:   desfazivel(m),
  }))
}

/**
 * Erro de banco vira mensagem na tela, e não uma exceção nua.
 *
 * As gravações lá dentro passaram a falhar alto (`gravar`). Sem esta
 * captura a exceção subiria até o cliente como rejeição sem tratamento: o
 * log teria o motivo e a tela não mostraria nada — que é o silêncio de
 * novo, só que mais caro de achar.
 */
export async function saveBarcodeToProduct(
  ...args: Parameters<typeof saveBarcodeToProductInterno>
): ReturnType<typeof saveBarcodeToProductInterno> {
  try {
    return await saveBarcodeToProductInterno(...args)
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

async function saveBarcodeToProductInterno(productId: string, barcode: string) {
  try {
    const ctx   = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')
    const admin = createAdminClient()

    const prod = await ler(admin
      .from('products')
      .select('tenant_id')
      .eq('id', productId)
      .maybeSingle(), 'buscar o produto')
    if (!prod || prod.tenant_id !== ctx.tenantId)
      return { error: 'Produto não encontrado.' }

    const code = barcode.trim()
    const conflict = await ler(admin
      .from('products')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId!)
      .eq('barcode', code)
      .neq('id', productId)
      .maybeSingle(), 'conferir o código de barras')
    if (conflict)
      return { error: `Código já vinculado ao produto "${conflict.name}".` }

    await gravar(admin
      .from('products')
      .update({ barcode: code, updated_at: new Date().toISOString() })
      .eq('id', productId), 'salvar o código de barras')

    revalidatePath('/admin/estoque')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? mensagemDoErro(e) : 'Erro inesperado.' }
  }
}

export async function searchProducts(query: string) {
  try {
    const ctx   = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')
    const admin = createAdminClient()

    const data = await ler(admin
      .from('products')
      .select('id, name, sku, unit, barcode')
      .eq('tenant_id', ctx.tenantId!)
      .eq('is_active', true)
      .ilike('name', `%${query.trim()}%`)
      .order('name')
      .limit(20), 'buscar o produto')

    return { products: (data ?? []) as { id: string; name: string; sku: string | null; unit: string; barcode: string | null }[] }
  } catch {
    return { products: [] as { id: string; name: string; sku: string | null; unit: string; barcode: string | null }[] }
  }
}

/**
 * Em quem foi aplicado o lote (A40 da 7ª simulação, 2026-11-05 — o recall): a
 * cliente, o dia, a profissional (ou quem vendeu) e a quantidade de cada saída
 * do lote para uma cliente. Pede o Estoque e as Clientes (a lista diz nomes de
 * cliente): sem as Clientes, a tela nem oferece. O lote é da rede e da unidade
 * ao alcance — quem tem unidade fixa só o da dela.
 */
export async function aplicacoesDoLote(loteId: string): Promise<{ error?: string; lote?: { numero: string | null; produto: string }; aplicacoes?: AplicacaoDoLote[] }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'VIEW')
    assertPermission(ctx, 'clients', 'VIEW')
    if (typeof loteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(loteId)) return { error: 'Lote não encontrado.' }
    const admin = createAdminClient()
    const lote = await ler(admin.from('product_batches')
      .select('id, branch_id, batch_number, products!inner(name, unit, consumption_unit, units_per_package, tenant_id)')
      .eq('id', loteId).eq('products.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o lote')
    if (!lote || !alcancaUnidade(ctx, lote.branch_id as string)) return { error: 'Lote não encontrado.' }
    const produto = lote.products as unknown as { name: string } & UnidadesDoProduto
    return {
      lote: { numero: (lote.batch_number as string | null) ?? null, produto: produto.name },
      aplicacoes: await aplicacoesDoLoteCore(admin, ctx.tenantId!, loteId, unidadeDoInsumo(produto), fatorDoProduto(produto)),
    }
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

/** O rendimento da embalagem em consumo (o `fator_de_consumo` do banco); sem unidade de consumo, 1. */
function fatorDoProduto(p: UnidadesDoProduto): number {
  return p.consumption_unit && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : 1
}

/** Um lote que já acabou, como a tela o lista (D15 da 9ª). */
export interface LoteEsgotado { id: string; numero: string | null; validade: string | null }

/**
 * Os lotes ESGOTADOS do produto numa unidade (D15 da 9ª simulação, 2026-11-07):
 * a linha aberta do Estoque lista só os lotes com saldo, e o lote que acabou
 * sumia com o "Aplicado em" — o recall é justamente do lote que já foi usado.
 * Pede o Estoque; o produto é da rede e a unidade, ao alcance. O "Aplicado em"
 * de cada um segue pedindo as Clientes (`aplicacoesDoLote`).
 */
export async function lotesEsgotados(produtoId: string, unidadeId: string): Promise<{ error?: string; lotes?: LoteEsgotado[] }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'VIEW')
    const uuid = /^[0-9a-f-]{36}$/i
    if (typeof produtoId !== 'string' || !uuid.test(produtoId) || typeof unidadeId !== 'string' || !uuid.test(unidadeId)) return { error: 'Produto não encontrado.' }
    if (!alcancaUnidade(ctx, unidadeId)) return { error: 'Produto não encontrado.' }
    const admin = createAdminClient()
    const [produto, unidade] = await Promise.all([
      ler(admin.from('products').select('id').eq('id', produtoId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o produto'),
      ler(admin.from('branches').select('id').eq('id', unidadeId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade'),
    ])
    if (!produto || !unidade) return { error: 'Produto não encontrado.' }
    type Linha = { id: string; batch_number: string | null; expires_at: string | null }
    const lotes = await lerTodas<Linha>((de, ate) => admin.from('product_batches')
      .select('id, batch_number, expires_at')
      .eq('product_id', produtoId).eq('branch_id', unidadeId).lte('quantity', 0)
      .order('expires_at', { ascending: false, nullsFirst: false }).order('id')
      .range(de, ate) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
    'carregar os lotes esgotados')
    return { lotes: lotes.map(l => ({ id: l.id, numero: l.batch_number, validade: l.expires_at })) }
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}

/**
 * Desfazer uma ENTRADA lançada errada (A38 da 10ª simulação, 2026-11-10: para
 * desfazer duas entradas erradas, o Time B fez um ajuste a menos e zerou pelo
 * FEFO o lote real). Enquanto o lote dela não teve saída: uma entrada ao
 * contrário, que tira do lote dela — não é perda nem consumo. A original fica,
 * marcada como desfeita, com o motivo. Pede o Estoque em Gerenciar e a unidade
 * da entrada ao alcance; a conferência do lote é do banco
 * (`estoque_desfazer_entrada`).
 */
export async function desfazerEntradaDeEstoque(movimentoId: string, motivo: string): Promise<{ error?: string; success?: true }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'stock', 'MANAGE')
    if (typeof movimentoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(movimentoId)) return { error: 'Entrada não encontrada.' }
    const porque = typeof motivo === 'string' ? motivo.trim() : ''
    if (!porque) return { error: 'Diga por que a entrada é desfeita.' }
    if (porque.length > 300) return { error: 'O motivo passa de 300 caracteres.' }
    const admin = createAdminClient()
    const mov = await ler(admin.from('stock_movements').select('id, branch_id, branches!inner(tenant_id)')
      .eq('id', movimentoId).eq('branches.tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a entrada')
    if (!mov || !alcancaUnidade(ctx, mov.branch_id as string)) return { error: 'Entrada não encontrada.' }
    const { error } = await admin.rpc('estoque_desfazer_entrada', {
      p_tenant: ctx.tenantId!, p_movimento: movimentoId, p_motivo: porque, p_autor: ctx.internalUserId,
    })
    if (error) {
      if (error.code === 'P0001') return { error: error.message }
      throw new Error(`Não consegui desfazer a entrada: ${error.message}`)
    }
    revalidatePath('/admin/estoque')
    if (ctx.branchId) revalidatePath('/*/stock')
    return { success: true }
  } catch (e) {
    if ((e as { digest?: string })?.digest) throw e
    return { error: mensagemDoErro(e) }
  }
}
