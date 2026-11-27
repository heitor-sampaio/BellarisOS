import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { saldoNaPrateleira } from '@/lib/estoque/saldo-em-texto'
import { medidaNoPlural } from '@/lib/estoque/medidas'
import { recusaDoCustoDaEntrada, recusaDoEstoqueAcimaDoRegistro } from '@/lib/estoque/limites-do-registro'
import { avisarOMinimoDepois } from '@/lib/estoque/aviso-do-minimo'

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
 * unidade" não vale para ele) gravava no produto ou na unidade de OUTRA rede.
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

/**
 * A unidade desativada não RECEBE estoque (F72; H6): entrada nela e
 * transferência para ela são coisa nova numa unidade fora do ar. Tirar o que
 * sobrou (transferir DELA, ajustar, registrar a perda) continua — é resolver.
 */
export const RECUSA_DA_UNIDADE_DESATIVADA = 'Esta unidade foi desativada: o estoque novo vai para uma unidade ativa.'

export async function unidadeDesativada(admin: Admin, tenantId: string, branchId: string): Promise<boolean> {
  const u = await ler(admin.from('branches').select('is_active').eq('id', branchId).eq('tenant_id', tenantId).maybeSingle(),
    'conferir se a unidade está ativa') as { is_active: boolean } | null
  return u?.is_active === false
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
  /** E14 (o Heitor, 13/11: "Na entrada no estoque, escolhe fornecedor e marca"): a marca, por nome ou pela lista. */
  marca?: string | null
  marcaId?: string | null
  notaFiscal?: string | null
}

/** O nome da linha escolhida da lista (conferida a rede), senão o texto; `undefined` = o id não é da rede. */
async function nomeDaLista(admin: Admin, tenantId: string, lista: 'marcas' | 'fornecedores', id: string | null | undefined, texto: string | null | undefined): Promise<string | null | undefined> {
  if (!id) return texto?.trim() || null
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined
  const linha = await ler(admin.from(lista).select('nome').eq('id', id).eq('tenant_id', tenantId).maybeSingle(),
    lista === 'marcas' ? 'buscar a marca' : 'buscar o fornecedor') as { nome: string } | null
  return linha ? linha.nome : undefined
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

/**
 * O produto e o saldo da unidade na régua do MOVIMENTO (a de consumo, quando o
 * produto tem uma: `fator_de_consumo`; senão, a embalagem) — o que o banco grava
 * em `stock_movements.quantity` e `balance_after`. Para a conferência do registro.
 */
async function saldoNoMovimento(admin: Admin, productId: string, branchId: string): Promise<{
  fator: number; saldo: number; medida: string; consumo: string | null
}> {
  const [p, s] = await Promise.all([
    ler(admin.from('products').select('unit, consumption_unit, units_per_package').eq('id', productId).maybeSingle(), 'ler o produto'),
    ler(admin.from('branch_product_stock').select('current_stock, current_rendimento').eq('product_id', productId).eq('branch_id', branchId).maybeSingle(), 'ler o saldo'),
  ]) as [{ unit: string | null; consumption_unit: string | null; units_per_package: number | null } | null, { current_stock: number; current_rendimento: number | null } | null]
  const rende = p?.consumption_unit?.trim() && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : null
  const embalagens = Number(s?.current_stock ?? 0)
  const saldo = rende ? (s?.current_rendimento != null ? Number(s.current_rendimento) : embalagens * rende) : embalagens
  return { fator: rende ?? 1, saldo, medida: medidaNoPlural(p?.unit ?? '', 2) || 'embalagens', consumo: rende ? p!.consumption_unit!.trim() : null }
}

/**
 * A transferência que o registro do DESTINO não guarda (o saldo depois, na
 * unidade do movimento — numeric(10,4)), ou `null`. A que pede mais do que a
 * origem tem fica com a recusa do banco ("Estoque insuficiente na unidade de
 * origem"), que é a que diz o que fazer.
 */
export async function recusaDoRegistroNaTransferencia(admin: Admin, t: {
  productId: string; origem: string; destino: string; quantidade: number
}): Promise<string | null> {
  const [de, para] = await Promise.all([
    saldoNoMovimento(admin, t.productId, t.origem),
    saldoNoMovimento(admin, t.productId, t.destino),
  ])
  if (t.quantidade * de.fator > Math.max(de.saldo, 0)) return null
  return recusaDoEstoqueAcimaDoRegistro({
    quantidade: t.quantidade, fator: para.fator, medida: para.medida, consumo: para.consumo,
    saldoDepois: para.saldo + t.quantidade * para.fator,
  })
}

export async function entradaDeEstoqueCore(admin: Admin, ctx: TenantContext, e: EntradaDeEstoque): Promise<{ ok: true; saldo: number } | { error: string }> {
  if (!alcancaUnidade(ctx, e.branchId)) return { error: 'Operação não permitida fora da sua unidade.' }
  if (!(e.quantidade > 0)) return { error: 'Quantidade deve ser maior que zero.' }
  // O custo negativo é impossível, e o que `products.cost_price` não guarda também
  // (o Heitor, 19/11: "Qualquer gravação que não passa pela validação do backend ta
  // errada") — só o min="0" do campo barrava.
  const recusaDoCusto = recusaDoCustoDaEntrada(e.custoUnitario)
  if (recusaDoCusto) return { error: recusaDoCusto }
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, e.productId, [e.branchId]))) {
    return { error: 'Produto ou unidade não encontrado.' }
  }
  if (await unidadeDesativada(admin, ctx.tenantId!, e.branchId)) return { error: RECUSA_DA_UNIDADE_DESATIVADA }
  // O que o registro não guarda (o Heitor, 25/11: "Se não for impossível, ainda que
  // improvável, pode ser feito."; o impossível é o tipo da coluna, decisão do Claude,
  // 25/11): a quantidade em embalagens (o lote), na unidade do movimento, e o saldo
  // depois — lido na hora de gravar. Voltava do banco "numeric field overflow".
  const antes = await saldoNoMovimento(admin, e.productId, e.branchId)
  const acimaDoRegistro = recusaDoEstoqueAcimaDoRegistro({
    quantidade: e.quantidade, fator: antes.fator, medida: antes.medida, consumo: antes.consumo,
    saldoDepois: antes.saldo + e.quantidade * antes.fator,
  })
  if (acimaDoRegistro) return { error: acimaDoRegistro }

  // Numa transação só, com a linha do saldo travada (estoque_entrada): duas
  // entradas ao mesmo tempo (a tela e o Copilot) não se perdem mais.
  // Movimentação de estoque NUNCA gera despesa (D13 revisto, decisão do Heitor,
  // 2026-10-28): o custo fica no movimento, base do insumo, do custo e da margem.
  // E14: a marca e o fornecedor escolhidos da lista vencem o texto (o banco liga
  // o movimento à lista pelo nome — a que existe ou uma nova).
  const fornecedor = await nomeDaLista(admin, ctx.tenantId!, 'fornecedores', e.fornecedorId, e.fornecedor)
  if (fornecedor === undefined) return { error: 'Fornecedor não encontrado.' }
  const marca = await nomeDaLista(admin, ctx.tenantId!, 'marcas', e.marcaId, e.marca)
  if (marca === undefined) return { error: 'Marca não encontrada.' }

  const saldo = await gravar(admin.rpc('estoque_entrada', {
    p_produto: e.productId, p_unidade: e.branchId, p_quantidade: e.quantidade,
    p_custo: e.custoUnitario ?? null, p_observacao: e.observacao ?? null,
    p_lote: e.lote || null, p_validade: e.validade || null, p_autor: ctx.internalUserId,
    p_fornecedor: fornecedor, p_nota_fiscal: e.notaFiscal?.trim() || null,
    p_marca: marca,
  }), 'registrar a entrada de estoque') as number
  // D1 da 36ª: a linha que nasce abaixo do mínimo é um cruzamento (o gatilho o põe na fila).
  avisarOMinimoDepois(ctx.tenantId!)
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
  /**
   * A10 da 24ª: o ajuste da "Correção de cadastro" (o custo ou a quantidade
   * digitados errado na entrada, depois que já saiu algo do lote). Grava pelo
   * `estoque_ajuste_de_correcao`, que marca o movimento: não é perda — fica fora
   * do "Consumo com perdas" e do giro (`metrics_perdas`).
   */
  correcao?: boolean
}): Promise<{ ok: true; de: number } | { error: string }> {
  if (!alcancaUnidade(ctx, a.branchId)) return { error: 'Operação não permitida fora da sua unidade.' }
  if (!a.motivo.trim()) return { error: 'Motivo do ajuste é obrigatório.' }
  if (Number.isNaN(a.novoSaldo) || a.novoSaldo < 0) return { error: 'Novo estoque não pode ser negativo.' }
  if (!(await produtoEUnidadesDaRede(admin, ctx.tenantId!, a.productId, [a.branchId]))) {
    return { error: 'Produto ou unidade não encontrado.' }
  }

  // A contagem é o saldo novo do movimento (`balance_after`, numeric(10,4)): na
  // unidade de consumo, ela mesma; em embalagens, vezes o que a embalagem rende.
  // O que o registro não guarda volta em português (decisão do Claude, 25/11).
  const atual = await saldoNoMovimento(admin, a.productId, a.branchId)
  const acimaDoRegistro = a.emConsumo && atual.consumo
    ? recusaDoEstoqueAcimaDoRegistro({ quantidade: a.novoSaldo, fator: 1, medida: atual.consumo })
    : recusaDoEstoqueAcimaDoRegistro({ quantidade: a.novoSaldo, fator: atual.fator, medida: atual.medida, consumo: atual.consumo })
  if (acimaDoRegistro) return { error: acimaDoRegistro }

  if (a.loteId && !/^[0-9a-f-]{36}$/i.test(a.loteId)) return { error: 'Lote não encontrado nesta unidade.' }
  if (a.loteValidade && !/^\d{4}-\d{2}-\d{2}$/.test(a.loteValidade)) return { error: 'Validade do lote ilegível.' }

  // Numa transação só, com a linha do saldo travada (estoque_ajuste_com_lote:
  // a contagem exata, e o que sobra entra num lote — D5 da 10ª).
  const anterior = await gravar(admin.rpc(a.correcao ? 'estoque_ajuste_de_correcao' : 'estoque_ajuste_com_lote', {
    p_produto: a.productId, p_unidade: a.branchId, p_contagem: a.novoSaldo, p_em_consumo: !!a.emConsumo,
    p_motivo: a.motivo.trim(), p_autor: ctx.internalUserId,
    p_lote: a.loteId || null, p_lote_numero: null, p_lote_validade: a.loteValidade || null,
  }), 'registrar o ajuste de estoque') as number
  // D1 da 36ª: o aviso de cada cruzamento do mínimo sai logo depois (a rotina é a rede de segurança).
  avisarOMinimoDepois(ctx.tenantId!)
  return { ok: true, de: Number(anterior) }
}
