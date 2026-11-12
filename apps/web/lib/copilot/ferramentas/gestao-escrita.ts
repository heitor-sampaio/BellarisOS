import 'server-only'
import { z } from 'zod/v4'
import { revalidatePath } from 'next/cache'
import { isOwnScope, ownerFilter } from '@/lib/auth'
import { maskPhone, unitTag } from '@estetica-os/utils'
import { origensDaRede } from '@/lib/crm/origens'
import { ler } from '@/lib/db'
import { dayKeyTZ } from '@/lib/datetime'
import { lancarCore, marcarPagoCore, lancamentoAoAlcance, recusaDasVezesDaBaixa, CATEGORIAS_DE_DESPESA, CATEGORIAS_DE_RECEITA, FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { entradaDeEstoqueCore, ajusteDeEstoqueCore, saldoAgoraEmTexto } from '@/lib/estoque/movimentos'
import { loteVencido, validadeNaTela } from '@/lib/estoque/validade'
import { medidaNoPlural } from '@/lib/estoque/medidas'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { criarOportunidadeCore, moverEtapaCore } from '@/lib/crm/oportunidade'
import { leadAoAlcance } from '@/lib/crm/alcance'
import { podeTrocarResponsavel, trocarResponsavelCore } from '@/lib/crm/responsavel'
import { rotaOportunidade } from '@/lib/rotas'
import type { ContextoDaFerramenta, FerramentaDeEscrita } from '@/lib/copilot/ferramentas/tipos'
import { DATA, UUID, dinheiro, resolverMembro, resolverProcedimento, resolverUnidade } from '@/lib/copilot/ferramentas/comum'
import { BANDEIRAS, rotuloDaBandeira } from '@/lib/financeiro/bandeiras'

/**
 * As GRAVAÇÕES de financeiro, estoque e oportunidades. O mesmo molde da
 * agenda: prepara o cartão, e só o "Confirmar" grava — pelos núcleos da tela.
 * Estorno e exclusão ficam fora (decisão do plano: o Copilot não desfaz
 * dinheiro nem apaga nada).
 */

const FORMA_LEGIVEL: Record<string, string> = { CASH: 'dinheiro', PIX: 'Pix', DEBIT_CARD: 'cartão de débito', CREDIT_CARD: 'cartão de crédito' }
const FORMA_DO_TEXTO: Record<string, string> = {
  dinheiro: 'CASH', especie: 'CASH', pix: 'PIX', debito: 'DEBIT_CARD', 'cartao de debito': 'DEBIT_CARD',
  credito: 'CREDIT_CARD', 'cartao de credito': 'CREDIT_CARD', cartao: 'CREDIT_CARD',
}
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
function formaDePagamento(pedido?: string): string | null | { erro: string } {
  if (!pedido) return null
  const p = pedido.toUpperCase()
  if ((FORMAS_DE_PAGAMENTO as readonly string[]).includes(p)) return p
  const achada = FORMA_DO_TEXTO[semAcento(pedido)]
  return achada ?? { erro: `Forma de pagamento "${pedido}" não reconhecida: dinheiro, Pix, débito ou crédito.` }
}
/** A bandeira do cartão (r3-f13-01), pelo nome ("Elo", "master"…), só no cartão. */
function bandeiraDoPedido(pedido: string | undefined, forma: string | null): string | null | { erro: string } {
  if (!pedido) return null
  if (forma !== 'CREDIT_CARD' && forma !== 'DEBIT_CARD') return { erro: 'Bandeira só no pagamento no cartão (débito ou crédito).' }
  const t = semAcento(pedido).replace(/[^a-z]/g, '')
  const achada = BANDEIRAS.find(b => semAcento(b.label).replace(/[^a-z]/g, '') === t || b.value.toLowerCase() === t || (t === 'master' && b.value === 'MASTERCARD'))
  return achada?.value ?? { erro: `Bandeira "${pedido}" não reconhecida: ${BANDEIRAS.map(b => b.label).join(', ')}.` }
}
function categoria(tipo: 'receita' | 'despesa', pedida: string): string | { erro: string } {
  const lista: readonly string[] = tipo === 'receita' ? CATEGORIAS_DE_RECEITA : CATEGORIAS_DE_DESPESA
  const achada = lista.find(c => semAcento(c) === semAcento(pedida)) ?? lista.find(c => semAcento(c).includes(semAcento(pedida)))
  return achada ?? { erro: `Categoria de ${tipo} "${pedida}" não existe. Categorias: ${lista.join(', ')}.` }
}
// Os dois portais: a rede e a unidade (o mesmo que a tela revalida).
const revalidar = (tela: string) => { revalidatePath(`/admin/${tela}`); revalidatePath(`/[slug]/${tela}`, 'page') }
const revalidarFinanceiro = () => revalidar('financeiro')

interface ArgsLancar { tipo: 'receita' | 'despesa'; descricao: string; valor: number; categoria: string; vencimento?: string; pago?: boolean; forma?: string; bandeira?: string; vezes?: number; unidade?: string }
interface PayloadLancar { branchId: string; tipo: 'INCOME' | 'EXPENSE'; categoria: string; descricao: string; valor: number; forma: string | null; bandeira?: string | null; vezes?: number | null; vencimento: string | null; pago: boolean }
/** "· 3x" no resumo do cartão (F17-5): o crédito em N vezes. */
const emVezes = (vezes: number | null | undefined) => vezes && vezes >= 2 ? ` · ${vezes}x` : ''

export const lancar: FerramentaDeEscrita<ArgsLancar, PayloadLancar> = {
  nome: 'lancar',
  tipo: 'escrita',
  modulo: 'financial', nivel: 'MANAGE',
  pode: ctx => !isOwnScope(ctx, 'financial'),
  recurso: 'financeiro',
  descricao: `Lança uma receita ou despesa avulsa (não ligada a atendimento): descrição, valor em reais, categoria (receita: ${CATEGORIAS_DE_RECEITA.join(', ')}; despesa: ${CATEGORIAS_DE_DESPESA.join(', ')}), vencimento (AAAA-MM-DD) se for a pagar/receber, ou pago=true com a forma (dinheiro, Pix, débito, crédito) e, no cartão, a bandeira se a pessoa disser (Visa, Mastercard, Elo, Amex, Hipercard, Outras). Na receita paga no crédito, as vezes se a pessoa disser ("no crédito em 3x" → vezes=3): é um pagamento só, que a operadora deposita em N.`,
  parametros: z.object({
    tipo: z.enum(['receita', 'despesa']),
    descricao: z.string().min(2).max(200),
    valor: z.number().positive().max(10_000_000),
    categoria: z.string().min(2).max(60),
    vencimento: DATA.optional(),
    pago: z.boolean().optional(),
    forma: z.string().max(30).optional(),
    bandeira: z.string().max(30).optional(),
    vezes: z.number().int().min(1).max(12).optional(),
    unidade: z.string().max(80).optional(),
  }),
  async preparar(c, a) {
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const cat = categoria(a.tipo, a.categoria)
    if (typeof cat !== 'string') return cat
    const forma = formaDePagamento(a.forma)
    if (forma && typeof forma !== 'string') return forma
    const pago = !!a.pago
    if (!pago && !a.vencimento) return { erro: 'Já foi pago (e como), ou qual é o vencimento?' }
    const bandeira = pago && a.tipo === 'receita' ? bandeiraDoPedido(a.bandeira, forma as string | null) : null
    if (bandeira && typeof bandeira !== 'string') return bandeira
    // F17-5: as vezes só na receita PAGA no crédito, até o limite da clínica — a regra da baixa.
    if (a.vezes && a.vezes > 1 && !pago) return { erro: 'As vezes no cartão são do pagamento: diga que já foi pago, no crédito.' }
    const recusaDasVezes = await recusaDasVezesDaBaixa(c.ctx, a.tipo === 'receita' ? 'INCOME' : 'EXPENSE', forma as string | null, a.vezes)
    if (recusaDasVezes) return { erro: recusaDasVezes }
    const vezes = a.vezes && a.vezes > 1 ? a.vezes : null
    const valor = Math.round(a.valor * 100) / 100
    return {
      resumo: {
        titulo: a.tipo === 'receita' ? 'Lançar receita' : 'Lançar despesa',
        linhas: [
          { rotulo: 'Descrição', valor: a.descricao.trim() },
          { rotulo: 'Valor', valor: dinheiro(valor) },
          { rotulo: 'Categoria', valor: cat },
          { rotulo: 'Situação', valor: pago ? `pago${forma ? ` · ${FORMA_LEGIVEL[forma]}` : ''}${emVezes(vezes)}${bandeira ? ` · ${rotuloDaBandeira(bandeira)}` : ''}` : `vence ${a.vencimento!.split('-').reverse().join('/')}` },
          { rotulo: 'Unidade', valor: u.unidade!.name },
        ],
      },
      payload: {
        branchId: u.unidade!.id, tipo: a.tipo === 'receita' ? 'INCOME' : 'EXPENSE', categoria: cat,
        descricao: a.descricao.trim(), valor, forma: forma as string | null, vencimento: a.vencimento ?? null, pago,
        ...(bandeira ? { bandeira } : {}),
        ...(vezes ? { vezes } : {}),
      },
    }
  },
  async efetivar(c, p) {
    const r = await lancarCore(c.admin, c.ctx, {
      branchId: p.branchId, tipo: p.tipo, categoria: p.categoria, descricao: p.descricao, valor: p.valor,
      formaDePagamento: p.forma, vencimento: p.vencimento, pago: p.pago, bandeira: p.bandeira ?? null, vezes: p.vezes ?? null,
    })
    if ('error' in r) return { erro: r.error }
    revalidarFinanceiro()
    return { mensagem: `${p.tipo === 'INCOME' ? 'Receita' : 'Despesa'} de ${dinheiro(p.valor)} lançada.` }
  },
}

export const marcarPago: FerramentaDeEscrita<{ lancamento: string; forma?: string; bandeira?: string; vezes?: number }, { transactionId: string; forma: string | null; bandeira?: string | null; vezes?: number | null }> = {
  nome: 'marcar_pago',
  tipo: 'escrita',
  // Dar baixa é do CAIXA, como na tela (markTransactionPaid). Com o
  // podeReceber, quem só tem o financeiro — até o "só as próprias comissões" —
  // dava baixa em qualquer lançamento da unidade.
  modulo: 'cashier', nivel: 'MANAGE',
  recurso: 'financeiro',
  descricao: 'Dá baixa (marca como pago agora) num lançamento em aberto (id, da ferramenta lancamentos), com a forma de pagamento (dinheiro, Pix, débito, crédito; obrigatória quando o lançamento não tem forma, como a parcela do crediário) e, no cartão, a bandeira se a pessoa disser (Visa, Mastercard, Elo, Amex, Hipercard, Outras). Na receita recebida no crédito, as vezes se a pessoa disser ("recebeu no crédito em 3x" → vezes=3).',
  parametros: z.object({ lancamento: UUID, forma: z.string().max(30).optional(), bandeira: z.string().max(30).optional(), vezes: z.number().int().min(1).max(12).optional() }),
  async preparar(c, a) {
    const tx = await lancamentoAoAlcance(c.admin, c.ctx, a.lancamento)
    if (!tx) return { erro: 'Lançamento não encontrado.' }
    if (tx.is_paid) return { erro: 'Esse lançamento já está pago.' }
    if (tx.notes === 'Estornada') return { erro: 'Esse lançamento foi estornado.' }
    const forma = formaDePagamento(a.forma)
    if (forma && typeof forma !== 'string') return forma
    // C34 (F67): sem meio no lançamento, a baixa pede a forma — como a tela.
    if (!forma && !tx.payment_method) return { erro: 'Esse lançamento não tem forma de pagamento: pergunte como foi pago (dinheiro, Pix, débito, crédito ou boleto, na despesa).' }
    const bandeira = bandeiraDoPedido(a.bandeira, (forma as string | null) ?? tx.payment_method)
    if (bandeira && typeof bandeira !== 'string') return bandeira
    // F17-5: as vezes só no crédito da receita, até o limite da clínica (a regra da baixa da tela).
    const recusaDasVezes = await recusaDasVezesDaBaixa(c.ctx, tx.type, (forma as string | null) ?? tx.payment_method, a.vezes)
    if (recusaDasVezes) return { erro: recusaDasVezes }
    const vezes = a.vezes && a.vezes > 1 ? a.vezes : null
    return {
      resumo: {
        titulo: 'Dar baixa no lançamento',
        linhas: [
          { rotulo: 'Lançamento', valor: tx.description ?? tx.category ?? '—' },
          { rotulo: 'Valor', valor: dinheiro(tx.amount) },
          ...(tx.due_date ? [{ rotulo: 'Vencimento', valor: dayKeyTZ(tx.due_date).split('-').reverse().join('/') }] : []),
          ...(forma ? [{ rotulo: 'Forma', valor: FORMA_LEGIVEL[forma as string]! }] : []),
          ...(bandeira ? [{ rotulo: 'Bandeira', valor: rotuloDaBandeira(bandeira)! }] : []),
          ...(vezes ? [{ rotulo: 'Vezes no cartão', valor: `${vezes}x — a operadora deposita em ${vezes}` }] : []),
        ],
      },
      payload: { transactionId: tx.id, forma: forma as string | null, ...(bandeira ? { bandeira } : {}), ...(vezes ? { vezes } : {}) },
    }
  },
  async efetivar(c, p) {
    const tx = await lancamentoAoAlcance(c.admin, c.ctx, p.transactionId)
    if (!tx || tx.is_paid) return { erro: 'O lançamento mudou de situação. Confira no financeiro.' }
    const r = await marcarPagoCore(c.admin, c.ctx, p.transactionId, p.forma, p.bandeira ?? null, p.vezes ?? null)
    if ('error' in r) return { erro: r.error }
    revalidarFinanceiro()
    return { mensagem: 'Baixa registrada.' }
  },
}

/** O produto da rede, pelo id ou pelo nome (tem de ser um só). */
type ProdutoAchado = { id: string; name: string; unit: string | null; consumption_unit: string | null; units_per_package: number | null }
async function resolverProduto(c: ContextoDaFerramenta, pedido: string): Promise<ProdutoAchado | { erro: string }> {
  const porId = UUID.safeParse(pedido)
  let q = c.admin.from('products').select('id, name, unit, consumption_unit, units_per_package').eq('tenant_id', c.ctx.tenantId!).eq('is_active', true)
  q = porId.success ? q.eq('id', pedido) : q.ilike('name', `%${pedido.replace(/[%_\\]/g, '')}%`)
  const achados = (await ler(q.limit(8), 'procurar o produto') as ProdutoAchado[] | null) ?? []
  const exato = achados.filter(p => p.name.toLowerCase() === pedido.trim().toLowerCase())
  if (achados.length === 1) return achados[0]!
  if (exato.length === 1) return exato[0]!
  if (!achados.length) return { erro: `Produto "${pedido}" não encontrado.` }
  return { erro: `Mais de um produto com "${pedido}": ${achados.map(p => p.name).join(', ')}. Qual?` }
}

/**
 * O saldo do ajuste em embalagens EXATAS e, com unidade de consumo, também nela
 * (D3 da 7ª: 780 UI são 7,8 frascos, não o "8" arredondado do current_stock).
 * O ajuste conta a fração como o frasco aberto (`estoque_ajuste_em`).
 */
async function saldoDoAjuste(c: ContextoDaFerramenta, productId: string, branchId: string): Promise<{ embalagens: number; consumo: string | null; rende: number | null }> {
  const [linha, prod] = await Promise.all([
    ler(c.admin.from('branch_product_stock').select('current_stock, current_rendimento').eq('product_id', productId).eq('branch_id', branchId).maybeSingle(), 'ler o saldo') as Promise<{ current_stock: number; current_rendimento: number | null } | null>,
    ler(c.admin.from('products').select('consumption_unit, units_per_package').eq('id', productId).maybeSingle(), 'ler o produto') as Promise<{ consumption_unit: string | null; units_per_package: number | null } | null>,
  ])
  const rende = prod?.consumption_unit && Number(prod.units_per_package) > 0 ? Number(prod.units_per_package) : null
  const embalagens = Number(linha?.current_stock ?? 0)
  if (!rende) return { embalagens, consumo: null, rende: null }
  const rend = linha?.current_rendimento != null ? Number(linha.current_rendimento) : embalagens * rende
  return { embalagens: Math.round(rend / rende * 10_000) / 10_000, consumo: prod!.consumption_unit!, rende }
}

interface ArgsEntrada { produto: string; quantidade: number; custoUnitario?: number; lote?: string; validade?: string; unidade?: string; observacao?: string; fornecedor?: string; notaFiscal?: string }
interface PayloadEntrada {
  productId: string; branchId: string; quantidade: number; custoUnitario: number | null; lote: string | null; validade: string | null; observacao: string | null
  fornecedor?: string | null; notaFiscal?: string | null
}

/**
 * O que a janela de Entrada diz (C5 do levantamento, F66): a regra da despesa
 * (D13 revisto — movimentação de estoque nunca gera despesa).
 */
const ENTRADA_SEM_DESPESA = 'Não gera despesa: o custo é a base do insumo, do valor em estoque e da margem. A compra que a clínica pagou entra no Financeiro por um lançamento (categoria “Compra de estoque”).'
const num = (n: number, casas = 4) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas })

export const entradaDeEstoque: FerramentaDeEscrita<ArgsEntrada, PayloadEntrada> = {
  nome: 'entrada_de_estoque',
  tipo: 'escrita',
  modulo: 'stock', nivel: 'MANAGE',
  recurso: 'estoque',
  descricao: 'Registra a ENTRADA (compra/recebimento) de um produto numa unidade: quantidade em embalagens, custo unitário opcional, lote e validade (AAAA-MM-DD) opcionais, o fornecedor (o nome; entra na lista de Fornecedores da rede) e a nota fiscal, opcionais.',
  parametros: z.object({
    produto: z.string().min(2).max(80),
    quantidade: z.number().positive().max(100_000),
    custoUnitario: z.number().positive().max(1_000_000).optional(),
    lote: z.string().max(60).optional(),
    validade: DATA.optional(),
    unidade: z.string().max(80).optional(),
    observacao: z.string().max(200).optional(),
    fornecedor: z.string().max(120).optional(),
    notaFiscal: z.string().max(60).optional(),
  }),
  async preparar(c, a) {
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const p = await resolverProduto(c, a.produto)
    if ('erro' in p) return { erro: p.erro }
    // Sem o saldo no cartão: ele muda com o consumo até o Confirmar, e a entrada
    // continua valendo (o saldo novo vem na mensagem do resultado).
    const un = p.unit ?? ''
    const rende = p.consumption_unit && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : null
    // C5 (F66): o cartão diz o que a janela de Entrada diz — a quantidade no
    // plural e no que rende, "Não gera despesa", e a validade que já passou
    // (avisa; a entrada vale assim, princípio 2).
    const vencida = !!a.validade && loteVencido(a.validade, new Date(), await fusoDaUnidade(c.ctx.tenantId, u.unidade!.id))
    const fornecedor = a.fornecedor?.trim().replace(/\s+/g, ' ') || null
    const nota = a.notaFiscal?.trim() || null
    return {
      resumo: {
        titulo: 'Entrada de estoque',
        linhas: [
          { rotulo: 'Produto', valor: p.name },
          { rotulo: 'Quantidade', valor: `+${num(a.quantidade)} ${medidaNoPlural(un, a.quantidade)}${rende ? ` (${num(a.quantidade * rende)} ${p.consumption_unit})` : ''}`.trim() },
          ...(a.custoUnitario ? [{ rotulo: 'Custo unitário', valor: dinheiro(a.custoUnitario) }] : []),
          ...(a.lote ? [{ rotulo: 'Lote', valor: `${a.lote}${a.validade ? ` · vence ${a.validade.split('-').reverse().join('/')}` : ''}` }] : []),
          ...(fornecedor ? [{ rotulo: 'Fornecedor', valor: fornecedor }] : []),
          ...(nota ? [{ rotulo: 'Nota fiscal', valor: nota }] : []),
          { rotulo: 'Unidade', valor: u.unidade!.name },
        ],
        aviso: (vencida ? `Esta validade já passou (${validadeNaTela(a.validade!)}): o lote entra vencido. Confira a data na embalagem — se estiver certa, a entrada vale assim. ` : '')
          + ENTRADA_SEM_DESPESA,
      },
      payload: {
        productId: p.id, branchId: u.unidade!.id, quantidade: a.quantidade, custoUnitario: a.custoUnitario ?? null,
        lote: a.lote?.trim() || null, validade: a.validade ?? null, observacao: a.observacao?.trim() || null,
        fornecedor, notaFiscal: nota,
      },
    }
  },
  async efetivar(c, p) {
    // O fornecedor vai em texto: o banco o resolve na lista da rede (o mesmo
    // nome, sem caixa nem espaços, é o mesmo; o novo entra — C76).
    const r = await entradaDeEstoqueCore(c.admin, c.ctx, p)
    if ('error' in r) return { erro: r.error }
    revalidar('estoque')
    return { mensagem: `Entrada registrada. Saldo agora: ${await saldoAgoraEmTexto(c.admin, p.productId, p.branchId)}.` }
  },
}

export const ajusteDeEstoque: FerramentaDeEscrita<{ produto: string; novoSaldo: number; motivo: string; unidade?: string }, { productId: string; branchId: string; novoSaldo: number; motivo: string }> = {
  nome: 'ajuste_de_estoque',
  tipo: 'escrita',
  modulo: 'stock', nivel: 'MANAGE',
  recurso: 'estoque',
  descricao: 'Corrige o saldo de um produto numa unidade para o número CONTADO (inventário), com o motivo (obrigatório).',
  parametros: z.object({
    produto: z.string().min(2).max(80),
    novoSaldo: z.number().min(0).max(1_000_000),
    motivo: z.string().min(3).max(200),
    unidade: z.string().max(80).optional(),
  }),
  async preparar(c, a) {
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const p = await resolverProduto(c, a.produto)
    if ('erro' in p) return { erro: p.erro }
    const s = await saldoDoAjuste(c, p.id, u.unidade!.id)
    const saldo = s.embalagens
    if (saldo === a.novoSaldo) return { erro: `O saldo de ${p.name} já é ${saldo}.` }
    // C5 (F66): o cartão diz o que a janela de Ajuste diz — para onde vai a
    // diferença (a menos é perda, "Inventário"; a mais entra num lote novo) e,
    // como a D5 da 11ª, a variação de mais da metade do saldo.
    const delta = a.novoSaldo - saldo
    const pct = saldo > 0 ? Math.abs(delta) / saldo * 100 : null
    const un = p.unit ?? ''
    const naOutra = s.rende ? ` (${num(a.novoSaldo)} ${medidaNoPlural(un, a.novoSaldo)} são ${num(a.novoSaldo * s.rende)} ${s.consumo})` : ''
    const aviso = [
      pct !== null && pct > 50
        ? `A contagem muda o saldo em ${num(pct, 0)}%. Confira se contou na unidade certa: a contagem está em ${medidaNoPlural(un, 2)}${naOutra}.`
        : null,
      delta < 0
        ? 'A diferença sai do lote que vence primeiro e entra em Relatórios → Estoque, “Perdas no período”, como Inventário, ao custo do lote. Não gera despesa.'
        : 'A diferença entra num lote novo, sem número. Não gera despesa.',
      'Errado, se desfaz no Histórico (“Desfazer ajuste”).',
    ].filter(Boolean).join(' ')
    return {
      resumo: {
        titulo: 'Ajustar estoque',
        linhas: [
          { rotulo: 'Produto', valor: p.name },
          { rotulo: 'Saldo', valor: s.rende
            ? `${num(saldo)} → ${num(a.novoSaldo)} ${p.unit ?? ''} (${num(saldo * s.rende)} → ${num(a.novoSaldo * s.rende)} ${s.consumo})`
            : `${saldo} → ${a.novoSaldo} ${p.unit ?? ''}`.trim() },
          { rotulo: 'Motivo', valor: a.motivo.trim() },
          { rotulo: 'Unidade', valor: u.unidade!.name },
        ],
        aviso,
      },
      payload: { productId: p.id, branchId: u.unidade!.id, novoSaldo: a.novoSaldo, motivo: a.motivo.trim() },
    }
  },
  async efetivar(c, p) {
    const r = await ajusteDeEstoqueCore(c.admin, c.ctx, p)
    if ('error' in r) return { erro: r.error }
    revalidar('estoque')
    return { mensagem: `Saldo ajustado de ${r.de} para ${p.novoSaldo}.` }
  },
}

interface ArgsOportunidade { nome: string; telefone?: string; email?: string; origem?: string; interesse?: string[]; observacao?: string; funil?: string; valor?: number; responsavel?: string }
interface PayloadOportunidade {
  nome: string; telefone: string | null; email: string | null; origem: string | null; procedureIds: string[]; observacoes: string | null; funnelId: string | null; tags: string[]
  valor?: number; responsavelId?: string
}

export const criarOportunidade: FerramentaDeEscrita<ArgsOportunidade, PayloadOportunidade> = {
  nome: 'criar_oportunidade',
  tipo: 'escrita',
  modulo: 'crm', nivel: 'MANAGE',
  recurso: 'oportunidades',
  descricao: 'Cria uma oportunidade (lead) no funil: nome e ao menos um contato (telefone ou e-mail); origem, procedimentos de interesse, observação, funil (nome), valor estimado em reais e responsável (nome de um membro da equipe) opcionais. Nasce na primeira etapa; sem responsável, você é o responsável.',
  parametros: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(8).max(20).optional(),
    email: z.string().max(160).optional(),
    origem: z.string().max(60).optional(),
    interesse: z.array(z.string().max(80)).max(5).optional(),
    observacao: z.string().max(300).optional(),
    funil: z.string().max(80).optional(),
    valor: z.number().positive().max(10_000_000).optional(),
    responsavel: z.string().min(2).max(120).optional(),
  }),
  async preparar(c, a) {
    if (!a.telefone && !a.email) return { erro: 'Qual o telefone ou o e-mail?' }
    // Escolher o responsável é a mesma trava da tela: CRM em Gerenciar, "todos".
    let responsavel: { id: string; name: string } | null = null
    if (a.responsavel) {
      if (!podeTrocarResponsavel(c.ctx)) return { erro: 'O seu cargo não escolhe o responsável da oportunidade: ela nasce com você.' }
      const r = await resolverMembro(c, a.responsavel)
      if ('erro' in r) return { erro: r.erro }
      responsavel = r
    }
    // A origem é a da lista da tela — as origens da CLÍNICA (A14 da 7ª,
    // Configurar funis): fora dela, o indicador por origem quebra.
    let origem: string | null = null
    if (a.origem) {
      const daClinica = (await origensDaRede(c.admin, c.ctx.tenantId!)).map(o => o.nome)
      origem = daClinica.find(k => semAcento(k) === semAcento(a.origem!)) ?? null
      if (!origem) return { erro: `Origem "${a.origem}" não existe. Origens: ${daClinica.join(', ')}.` }
    }
    // Criada no portal de uma unidade (ou por quem é de uma): nasce com a tag dela, como na tela.
    const u = c.ctx.branchId || c.slugDoPortal ? await resolverUnidade(c, null) : { unidade: null }
    const tags = 'unidade' in u && u.unidade ? [unitTag(u.unidade.name)] : []
    const digitos = a.telefone?.replace(/[^0-9]/g, '') ?? ''
    const procs: { id: string; name: string }[] = []
    for (const nome of a.interesse ?? []) {
      const p = await resolverProcedimento(c, nome)
      if ('erro' in p) return { erro: p.erro }
      procs.push(p)
    }
    let funil: { id: string; name: string } | null = null
    if (a.funil) {
      const funis = (await ler(c.admin.from('crm_funnels').select('id, name').eq('tenant_id', c.ctx.tenantId!).is('archived_at', null), 'ler os funis') as { id: string; name: string }[] | null) ?? []
      funil = funis.find(f => f.name.toLowerCase().includes(a.funil!.toLowerCase())) ?? null
      if (!funil) return { erro: `Funil "${a.funil}" não encontrado. Funis: ${funis.map(f => f.name).join(', ')}.` }
    }
    return {
      resumo: {
        titulo: 'Criar oportunidade',
        linhas: [
          { rotulo: 'Nome', valor: a.nome.trim() },
          ...(digitos ? [{ rotulo: 'Telefone', valor: maskPhone(digitos) }] : []),
          ...(a.email ? [{ rotulo: 'E-mail', valor: a.email.trim() }] : []),
          ...(procs.length ? [{ rotulo: 'Interesse', valor: procs.map(p => p.name).join(', ') }] : []),
          ...(origem ? [{ rotulo: 'Origem', valor: origem }] : []),
          ...(funil ? [{ rotulo: 'Funil', valor: funil.name }] : []),
          ...(a.valor ? [{ rotulo: 'Valor', valor: dinheiro(a.valor) }] : []),
          ...(responsavel ? [{ rotulo: 'Responsável', valor: responsavel.name }] : []),
        ],
      },
      payload: {
        nome: a.nome.trim(), telefone: digitos ? maskPhone(digitos) : null, email: a.email?.trim().toLowerCase() || null,
        origem, procedureIds: procs.map(p => p.id), observacoes: a.observacao?.trim() || null, funnelId: funil?.id ?? null, tags,
        ...(a.valor ? { valor: a.valor } : {}),
        ...(responsavel ? { responsavelId: responsavel.id } : {}),
      },
    }
  },
  async efetivar(c, p) {
    const r = await criarOportunidadeCore(c.admin, c.ctx, {
      nome: p.nome, telefone: p.telefone, email: p.email, origem: p.origem, observacoes: p.observacoes,
      procedureIds: p.procedureIds, funnelId: p.funnelId, tags: p.tags, valor: p.valor ?? null,
    })
    if ('error' in r) return { erro: r.error }
    revalidar('oportunidades')
    // Como a tela (createLead): nasce de quem criou, e o responsável escolhido
    // troca em seguida — a linha do tempo diz de quem para quem.
    if (p.responsavelId && podeTrocarResponsavel(c.ctx)) {
      const t = await trocarResponsavelCore(c.admin, c.ctx.tenantId!, r.leadId, p.responsavelId, { actorUserId: c.ctx.internalUserId, actorName: c.ctx.userName || null })
      if (!t.trocado && t.motivo) {
        return { mensagem: `Oportunidade criada, mas o responsável não mudou: ${t.motivo}`, href: rotaOportunidade(c.pagina, c.slugDoPortal, r.leadId, p.funnelId), rotuloDoLink: 'Abrir no quadro' }
      }
    }
    return { mensagem: 'Oportunidade criada.', href: rotaOportunidade(c.pagina, c.slugDoPortal, r.leadId, p.funnelId), rotuloDoLink: 'Abrir no quadro' }
  },
}

export const moverEtapa: FerramentaDeEscrita<{ oportunidade: string; etapa: string }, { leadId: string; stageId: string; funnelId: string }> = {
  nome: 'mover_etapa',
  tipo: 'escrita',
  modulo: 'crm', nivel: 'MANAGE',
  recurso: 'oportunidades',
  descricao: 'Move uma oportunidade (id, da ferramenta oportunidades) para outra etapa do MESMO funil (nome da etapa — inclusive as de ganho ou perda).',
  parametros: z.object({ oportunidade: UUID, etapa: z.string().min(2).max(80) }),
  async preparar(c, a) {
    if (!(await leadAoAlcance(c.admin, c.ctx, a.oportunidade))) return { erro: 'Oportunidade não encontrada.' }
    const lead = await ler(c.admin.from('leads').select('name, crm_stage_id').eq('id', a.oportunidade).single(), 'ler a oportunidade') as { name: string; crm_stage_id: string | null }
    const atual = lead.crm_stage_id
      ? await ler(c.admin.from('crm_stages').select('id, name, funnel_id').eq('id', lead.crm_stage_id).maybeSingle(), 'ler a etapa') as { id: string; name: string; funnel_id: string } | null
      : null
    if (!atual) return { erro: 'A oportunidade está sem etapa.' }
    const etapas = (await ler(c.admin.from('crm_stages').select('id, name').eq('tenant_id', c.ctx.tenantId!).eq('funnel_id', atual.funnel_id).order('position'), 'ler as etapas') as { id: string; name: string }[] | null) ?? []
    const p = a.etapa.trim().toLowerCase()
    const destino = etapas.find(e => e.name.toLowerCase() === p) ?? etapas.find(e => e.name.toLowerCase().includes(p))
    if (!destino) return { erro: `Etapa "${a.etapa}" não existe neste funil. Etapas: ${etapas.map(e => e.name).join(', ')}.` }
    if (destino.id === atual.id) return { erro: `A oportunidade já está em "${atual.name}".` }
    return {
      resumo: {
        titulo: 'Mover oportunidade',
        linhas: [
          { rotulo: 'Oportunidade', valor: lead.name },
          { rotulo: 'De', valor: atual.name },
          { rotulo: 'Para', valor: destino.name },
        ],
      },
      payload: { leadId: a.oportunidade, stageId: destino.id, funnelId: atual.funnel_id },
    }
  },
  async efetivar(c, p) {
    if (ownerFilter(c.ctx, 'crm') && !(await leadAoAlcance(c.admin, c.ctx, p.leadId))) return { erro: 'Oportunidade não encontrada.' }
    const r = await moverEtapaCore(c.admin, c.ctx, p.leadId, p.stageId)
    if ('error' in r) return { erro: r.error }
    revalidar('oportunidades')
    return { mensagem: 'Oportunidade movida.', href: rotaOportunidade(c.pagina, c.slugDoPortal, p.leadId, p.funnelId), rotuloDoLink: 'Abrir no quadro' }
  },
}

export const trocarResponsavel: FerramentaDeEscrita<{ oportunidade: string; responsavel: string | null }, { leadId: string; usuarioId: string | null; funnelId: string | null }> = {
  nome: 'trocar_responsavel',
  tipo: 'escrita',
  modulo: 'crm', nivel: 'MANAGE',
  recurso: 'oportunidades',
  // A trava da tela: o "só os meus" vê o responsável, mas não troca.
  pode: podeTrocarResponsavel,
  descricao: 'Troca o responsável de uma oportunidade (id, da ferramenta oportunidades) por outro membro ativo da equipe (nome), ou tira o responsável (responsavel = null).',
  parametros: z.object({ oportunidade: UUID, responsavel: z.string().min(2).max(120).nullable() }),
  async preparar(c, a) {
    if (!(await leadAoAlcance(c.admin, c.ctx, a.oportunidade))) return { erro: 'Oportunidade não encontrada.' }
    const lead = await ler(c.admin.from('leads').select('name, owner_id, crm_stages(funnel_id)')
      .eq('id', a.oportunidade).eq('tenant_id', c.ctx.tenantId!).single(), 'ler a oportunidade') as unknown as {
        name: string; owner_id: string | null; crm_stages: { funnel_id: string } | null
      }
    let para: { id: string; name: string } | null = null
    if (a.responsavel) {
      const r = await resolverMembro(c, a.responsavel)
      if ('erro' in r) return { erro: r.erro }
      para = r
    }
    if ((para?.id ?? null) === lead.owner_id) return { erro: para ? `${para.name} já é o responsável.` : 'A oportunidade já está sem responsável.' }
    const de = lead.owner_id
      ? (await ler(c.admin.from('users').select('name').eq('id', lead.owner_id).maybeSingle(), 'ler o responsável') as { name: string } | null)?.name ?? '—'
      : 'sem responsável'
    return {
      resumo: {
        titulo: 'Trocar o responsável',
        linhas: [
          { rotulo: 'Oportunidade', valor: lead.name },
          { rotulo: 'Responsável', valor: `${de} → ${para?.name ?? 'sem responsável'}` },
        ],
      },
      payload: { leadId: a.oportunidade, usuarioId: para?.id ?? null, funnelId: lead.crm_stages?.funnel_id ?? null },
    }
  },
  async efetivar(c, p) {
    // O mesmo núcleo do modal da oportunidade e da automação (lib/crm/responsavel.ts).
    const r = await trocarResponsavelCore(c.admin, c.ctx.tenantId!, p.leadId, p.usuarioId, { actorUserId: c.ctx.internalUserId, actorName: c.ctx.userName || null })
    if (!r.trocado) return { erro: r.motivo ?? 'O responsável já era esse.' }
    revalidar('oportunidades')
    return { mensagem: 'Responsável trocado.', href: rotaOportunidade(c.pagina, c.slugDoPortal, p.leadId, p.funnelId ?? undefined), rotuloDoLink: 'Abrir no quadro' }
  },
}
