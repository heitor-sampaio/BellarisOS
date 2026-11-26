import 'server-only'
import { z } from 'zod/v4'
import { revalidatePath } from 'next/cache'
import { can } from '@/lib/auth'
import { origensDaRede } from '@/lib/crm/origens'
import { ler } from '@/lib/db'
import { dayKeyTZ } from '@/lib/datetime'
import { lancarCore, marcarPagoCore, lancamentoAoAlcance, recusaDasVezesDaBaixa, CATEGORIAS_DE_DESPESA, CATEGORIAS_DE_RECEITA, FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { entradaDeEstoqueCore, ajusteDeEstoqueCore, saldoAgoraEmTexto } from '@/lib/estoque/movimentos'
import { loteVencido, validadeNaTela } from '@/lib/estoque/validade'
import { medidaNoPlural, recusaDaEmbalagem } from '@/lib/estoque/medidas'
import { fusoDaUnidade } from '@/lib/unidades/fuso-da-unidade'
import { criarOportunidadeCore, moverEtapaCore } from '@/lib/crm/oportunidade'
import { automacoesQueOMovimentoDispara, COLUNAS_DO_CARD_PARA_PREVER, type CardParaPrever } from '@/lib/crm/automacoes-do-movimento'
import { perguntaDasAutomacoes } from '@/lib/crm/mover-da-etapa'
import { leadAoAlcance } from '@/lib/crm/alcance'
import { fichasDoTelefoneDoLead } from '@/lib/crm/ficha-do-telefone'
import { telefoneParaGravar, TELEFONE_INCOMPLETO } from '@/lib/contatos/propagar'
import { telefoneDaFichaImportada } from '@/lib/importacao/normalizar'
import { podeTrocarResponsavel, trocarResponsavelCore } from '@/lib/crm/responsavel'
import { rotaOportunidade } from '@/lib/rotas'
import type { ContextoDaFerramenta, FerramentaDeEscrita } from '@/lib/copilot/ferramentas/tipos'
import { DATA, UUID, dinheiro, fusoDe, hojeNoFuso, resolverCliente, resolverMembro, resolverProcedimento, resolverUnidade, rota, texto } from '@/lib/copilot/ferramentas/comum'
import { CHAVES_DA_VENDA } from '@/lib/pdv/parcelas-da-cliente'
import { BANDEIRAS, rotuloDaBandeira } from '@/lib/financeiro/bandeiras'
import { CATEGORIA_COMPRA_DE_ESTOQUE, CATEGORIA_MATERIAL_DE_CONSUMO, ehCompraDeEstoque } from '@/lib/financeiro/categorias'
import { maquininhasDaRede } from '@/lib/financeiro/vezes-da-rede'
import { LIMITE_DE_VEZES_NO_CARTAO, acimaDoRegistro } from '@/lib/acima-do-comum'
import { avisoDoCustoDaEntrada } from '@/lib/estoque/custo-da-entrada'
// O que o registro não guarda: a MESMA regra que os núcleos da tela conferem no servidor.
import { LIMITE_DO_DINHEIRO, RECUSA_DO_DINHEIRO } from '@/lib/financeiro/limites-do-registro'
import { LIMITE_DO_ESTOQUE, RECUSA_DA_QUANTIDADE_DO_ESTOQUE, recusaDoEstoqueAcimaDoRegistro } from '@/lib/estoque/limites-do-registro'
import { LIMITE_DO_VALOR_DA_OPORTUNIDADE, RECUSA_DO_VALOR_DA_OPORTUNIDADE } from '@/lib/crm/valor-do-card'
import { podeDarBaixa } from '@/lib/financeiro/so-os-meus'

/**
 * As GRAVAÇÕES de financeiro, estoque e oportunidades. O mesmo molde da
 * agenda: prepara o cartão, e só o "Confirmar" grava — pelos núcleos da tela.
 * Estorno e exclusão ficam fora (decisão do plano: o Copilot não desfaz
 * dinheiro nem apaga nada).
 */

export const FORMA_LEGIVEL: Record<string, string> = { CASH: 'dinheiro', PIX: 'Pix', DEBIT_CARD: 'cartão de débito', CREDIT_CARD: 'cartão de crédito', BOLETO: 'boleto' }
const FORMA_DO_TEXTO: Record<string, string> = {
  dinheiro: 'CASH', especie: 'CASH', pix: 'PIX', debito: 'DEBIT_CARD', 'cartao de debito': 'DEBIT_CARD',
  credito: 'CREDIT_CARD', 'cartao de credito': 'CREDIT_CARD', cartao: 'CREDIT_CARD', boleto: 'BOLETO',
}
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/**
 * A forma pedida, para o lançamento de `tipo`. O boleto é só da DESPESA, como
 * a baixa e o lançamento da tela (`marcarPagoCore`, `FORMAS_DA_DESPESA`): o
 * Copilot dizia "ou boleto, na despesa" e recusava o boleto (CP1).
 */
export function formaDePagamento(pedido: string | undefined, tipo: 'INCOME' | 'EXPENSE'): string | null | { erro: string } {
  if (!pedido) return null
  const p = pedido.toUpperCase()
  const achada = (FORMAS_DE_PAGAMENTO as readonly string[]).includes(p) || p === 'BOLETO' ? p : FORMA_DO_TEXTO[semAcento(pedido)]
  if (achada === 'BOLETO' && tipo !== 'EXPENSE') return { erro: 'Boleto é forma de pagar uma despesa: a receita é em dinheiro, Pix, débito ou crédito.' }
  return achada ?? { erro: `Forma de pagamento "${pedido}" não reconhecida: dinheiro, Pix, débito ou crédito${tipo === 'EXPENSE' ? ' (ou boleto, na despesa)' : ''}.` }
}
/** A bandeira do cartão (r3-f13-01), pelo nome ("Elo", "master"…), só no cartão. */
function bandeiraDoPedido(pedido: string | undefined, forma: string | null): string | null | { erro: string } {
  if (!pedido) return null
  if (forma !== 'CREDIT_CARD' && forma !== 'DEBIT_CARD') return { erro: 'Bandeira só no pagamento no cartão (débito ou crédito).' }
  const t = semAcento(pedido).replace(/[^a-z]/g, '')
  const achada = BANDEIRAS.find(b => semAcento(b.label).replace(/[^a-z]/g, '') === t || b.value.toLowerCase() === t || (t === 'master' && b.value === 'MASTERCARD'))
  return achada?.value ?? { erro: `Bandeira "${pedido}" não reconhecida: ${BANDEIRAS.map(b => b.label).join(', ')}.` }
}
/**
 * C75: a maquininha do cartão pelo nome. Com uma só ativa, nada a perguntar
 * (o banco põe a única); com mais de uma, sem o nome, pergunta qual — a
 * primeira não vale calada (princípio 3).
 */
async function maquininhaDoPedido(c: ContextoDaFerramenta, pedido: string | undefined, forma: string | null): Promise<{ id: string; nome: string } | null | { erro: string }> {
  if (forma !== 'CREDIT_CARD' && forma !== 'DEBIT_CARD') return pedido ? { erro: 'Maquininha só no pagamento no cartão (débito ou crédito).' } : null
  const ativas = (await maquininhasDaRede(c.ctx.tenantId!)).filter(m => !m.arquivada)
  const nomes = ativas.map(m => m.nome).join(', ')
  if (!pedido) return ativas.length > 1 ? { erro: `Em qual maquininha passou o cartão? ${nomes}.` } : null
  const t = semAcento(pedido).trim()
  const achadas = ativas.filter(m => semAcento(m.nome) === t)
  const parecidas = achadas.length ? achadas : ativas.filter(m => semAcento(m.nome).includes(t))
  if (parecidas.length === 1) return { id: parecidas[0]!.id, nome: parecidas[0]!.nome }
  return { erro: parecidas.length ? `Mais de uma maquininha com "${pedido}": ${parecidas.map(m => m.nome).join(', ')}. Qual?` : `Maquininha "${pedido}" não encontrada. As da rede: ${nomes}.` }
}
function categoria(tipo: 'receita' | 'despesa', pedida: string): string | { erro: string } {
  const lista: readonly string[] = tipo === 'receita' ? CATEGORIAS_DE_RECEITA : CATEGORIAS_DE_DESPESA
  const achada = lista.find(c => semAcento(c) === semAcento(pedida)) ?? lista.find(c => semAcento(c).includes(semAcento(pedida)))
  return achada ?? { erro: `Categoria de ${tipo} "${pedida}" não existe. Categorias: ${lista.join(', ')}.` }
}
/** As categorias do cartão (A40 da 24ª): a sugerida primeiro, depois as outras da lista. */
function categoriasDoCartao(tipo: 'receita' | 'despesa', sugerida: string): { chave: string; rotulo: string }[] {
  const lista: readonly string[] = tipo === 'receita' ? CATEGORIAS_DE_RECEITA : CATEGORIAS_DE_DESPESA
  return [sugerida, ...lista.filter(c => c !== sugerida)].map(c => ({ chave: `categoria:${c}`, rotulo: c }))
}
/** A categoria da chave escolhida, se for uma da lista do tipo. */
function categoriaDaEscolha(tipo: 'INCOME' | 'EXPENSE', escolha: string): string | null {
  const lista: readonly string[] = tipo === 'INCOME' ? CATEGORIAS_DE_RECEITA : CATEGORIAS_DE_DESPESA
  const nome = escolha.startsWith('categoria:') ? escolha.slice('categoria:'.length) : ''
  return lista.includes(nome) ? nome : null
}
// Os dois portais: a rede e a unidade (o mesmo que a tela revalida).
const revalidar = (tela: string) => { revalidatePath(`/admin/${tela}`); revalidatePath(`/[slug]/${tela}`, 'page') }
const revalidarFinanceiro = () => revalidar('financeiro')

interface ArgsLancar { tipo: 'receita' | 'despesa'; descricao: string; valor: number; categoria: string; categoriaDaPessoa?: boolean; vencimento?: string; pago?: boolean; forma?: string; bandeira?: string; vezes?: number; maquininha?: string; unidade?: string }
interface PayloadLancar { branchId: string; tipo: 'INCOME' | 'EXPENSE'; categoria: string; descricao: string; valor: number; forma: string | null; bandeira?: string | null; vezes?: number | null; maquininha?: string | null; vencimento: string | null; pago: boolean; pagoEm?: string | null }
/** "· 3x" no resumo do cartão (F17-5): o crédito em N vezes. */
const emVezes = (vezes: number | null | undefined) => vezes && vezes >= 2 ? ` · ${vezes}x` : ''

export const lancar: FerramentaDeEscrita<ArgsLancar, PayloadLancar> = {
  nome: 'lancar',
  tipo: 'escrita',
  modulo: 'financial', nivel: 'MANAGE',
  recurso: 'financeiro',
  // D5 da 16ª (princípios 3 e 4): "Material de limpeza" virou "Compra de
  // estoque" e saiu do resultado. A categoria diz o que é, e na dúvida pergunta.
  // A22 da 17ª: o material de consumo tem a sua categoria (a mesma da tela).
  descricao: `Lança uma receita ou despesa avulsa (não ligada a atendimento): descrição, valor em reais, categoria (receita: ${CATEGORIAS_DE_RECEITA.join(', ')}; despesa: ${CATEGORIAS_DE_DESPESA.join(', ')}). "${CATEGORIA_COMPRA_DE_ESTOQUE}" é só a mercadoria que entra no estoque (produto de Venda direta ou insumo cadastrado no Estoque): conta no caixa e fica fora do resultado, porque o lucro já desconta o insumo consumido — material de limpeza, de copa ou de consumo da unidade não é compra de estoque: é "${CATEGORIA_MATERIAL_DE_CONSUMO}". Quando nenhuma categoria da lista serve com certeza, pergunte à pessoa qual usar (ou use "Outro" se ela disser); nunca escolha a mais parecida calado. categoriaDaPessoa=true só quando a PESSOA disse a categoria; quando é você quem a escolhe pela descrição, deixe de fora: o cartão a mostra como sugerida e a pessoa troca antes de confirmar. Vencimento (AAAA-MM-DD) se for a pagar/receber, ou pago=true com a forma (dinheiro, Pix, débito, crédito; na despesa, também boleto) e, no cartão, a bandeira se a pessoa disser (Visa, Mastercard, Elo, Amex, Hipercard, Outras). Na receita paga no crédito, as vezes se a pessoa disser ("no crédito em 3x" → vezes=3): é um pagamento só, que a operadora deposita em N. No cartão pago, a maquininha pelo nome (ex.: Stone) quando a rede tem mais de uma — sem ela, a ferramenta pergunta.`,
  parametros: z.object({
    tipo: z.enum(['receita', 'despesa']),
    // A descrição, como o Novo lançamento: só que exista, sem teto.
    descricao: texto({ min: 1, seCurto: 'Descrição é obrigatória.' }),
    // O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." A tela (lancarCore)
    // recusa só o zero; o teto de R$ 10.000.000 era só do Copilot. Sobra o que o registro não guarda.
    valor: z.number().positive('Valor deve ser maior que zero.').max(LIMITE_DO_DINHEIRO, RECUSA_DO_DINHEIRO),
    categoria: texto({ min: 2, max: 60 }),
    categoriaDaPessoa: z.boolean().optional(),
    vencimento: DATA.optional(),
    pago: z.boolean().optional(),
    forma: texto({ max: 30 }).optional(),
    bandeira: texto({ max: 30 }).optional(),
    // O Heitor, 25/11: acima de 12 vezes avisa; só o impossível (acima de 1.200, decisão do Claude) se recusa.
    vezes: z.number().int().min(1).max(LIMITE_DE_VEZES_NO_CARTAO).optional(),
    maquininha: texto({ max: 60 }).optional(),
    unidade: texto({ max: 80 }).optional(),
  }),
  async preparar(c, a) {
    // Os centavos: o que arredonda para zero é o zero que a tela recusa (antes do cartão, não no Confirmar).
    const valor = Math.round(a.valor * 100) / 100
    if (!(valor > 0)) return { erro: 'Valor deve ser maior que zero.' }
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const cat = categoria(a.tipo, a.categoria)
    if (typeof cat !== 'string') return cat
    const forma = formaDePagamento(a.forma, a.tipo === 'receita' ? 'INCOME' : 'EXPENSE')
    if (forma && typeof forma !== 'string') return forma
    const pago = !!a.pago
    if (!pago && !a.vencimento) return { erro: 'Já foi pago (e como), ou qual é o vencimento?' }
    const bandeira = pago && a.tipo === 'receita' ? bandeiraDoPedido(a.bandeira, forma as string | null) : null
    if (bandeira && typeof bandeira !== 'string') return bandeira
    // F17-5: as vezes só na receita PAGA no crédito, até o limite da clínica — a regra da baixa.
    if (a.vezes && a.vezes > 1 && !pago) return { erro: 'As vezes no cartão são do pagamento: diga que já foi pago, no crédito.' }
    // C75: a maquininha do cartão pago (com mais de uma, pergunta qual).
    const maq = pago && a.tipo === 'receita' ? await maquininhaDoPedido(c, a.maquininha, forma as string | null) : null
    if (maq && 'erro' in maq) return maq
    const recusaDasVezes = pago ? await recusaDasVezesDaBaixa(c.ctx, a.tipo === 'receita' ? 'INCOME' : 'EXPENSE', forma as string | null, a.vezes, maq?.id ?? null) : null
    if (recusaDasVezes) return { erro: recusaDasVezes }
    const vezes = a.vezes && a.vezes > 1 ? a.vezes : null
    // A29 da 21ª (princípio 3): o cartão do pago diz o DIA do pagamento — o de
    // hoje na unidade —, e é esse dia que o núcleo grava (pagoNoDia).
    const pagoEm = pago ? hojeNoFuso(await fusoDe(c, u.unidade!.id)) : null
    // A40 da 24ª (princípio 3): "Fornecedores" para a lavanderia, escolhida por ele e
    // gravada calada. Sem a pessoa dizer a categoria, ela vem SUGERIDA e se troca no cartão.
    const sugerida = !a.categoriaDaPessoa
    const avisos = [
      ...(sugerida ? ['A categoria foi sugerida pelo Copilot: confira ou troque antes de confirmar.'] : []),
      // D5 da 16ª (princípio 3): o cartão diz o que a categoria faz com o resultado.
      ...(a.tipo === 'despesa' && ehCompraDeEstoque(cat) ? ['Compra de estoque: conta no caixa e fica fora do resultado (é a mercadoria que entra no estoque).'] : []),
    ]
    return {
      resumo: {
        titulo: a.tipo === 'receita' ? 'Lançar receita' : 'Lançar despesa',
        linhas: [
          { rotulo: 'Descrição', valor: a.descricao.trim() },
          { rotulo: 'Valor', valor: dinheiro(valor) },
          ...(sugerida ? [] : [{ rotulo: 'Categoria', valor: cat }]),
          { rotulo: 'Situação', valor: pago ? `pago${forma ? ` · ${FORMA_LEGIVEL[forma]}` : ''}${emVezes(vezes)}${bandeira ? ` · ${rotuloDaBandeira(bandeira)}` : ''}${maq ? ` · ${maq.nome}` : ''}` : `vence ${a.vencimento!.split('-').reverse().join('/')}` },
          ...(pagoEm ? [{ rotulo: 'Pago em', valor: pagoEm.split('-').reverse().join('/') }] : []),
          { rotulo: 'Unidade', valor: u.unidade!.name },
        ],
        ...(avisos.length ? { aviso: avisos.join(' ') } : {}),
        ...(sugerida ? { escolhas: categoriasDoCartao(a.tipo, cat), escolhaEmLista: { rotulo: 'Categoria (sugerida)' } } : {}),
      },
      payload: {
        branchId: u.unidade!.id, tipo: a.tipo === 'receita' ? 'INCOME' : 'EXPENSE', categoria: cat,
        descricao: a.descricao.trim(), valor, forma: forma as string | null, vencimento: a.vencimento ?? null, pago,
        ...(pagoEm ? { pagoEm } : {}),
        ...(bandeira ? { bandeira } : {}),
        ...(vezes ? { vezes } : {}),
        ...(maq ? { maquininha: maq.id } : {}),
      },
    }
  },
  async efetivar(c, p, escolha) {
    // A40 da 24ª: a categoria escolhida na lista do cartão (a sugerida, ou outra da mesma lista).
    const categoria = escolha ? categoriaDaEscolha(p.tipo, escolha) : p.categoria
    if (!categoria) return { erro: 'Escolha uma das categorias do cartão.' }
    const r = await lancarCore(c.admin, c.ctx, {
      branchId: p.branchId, tipo: p.tipo, categoria, descricao: p.descricao, valor: p.valor,
      formaDePagamento: p.forma, vencimento: p.vencimento, pago: p.pago, pagoEm: p.pagoEm ?? null, bandeira: p.bandeira ?? null, vezes: p.vezes ?? null,
      maquininha: p.maquininha ?? null,
    })
    if ('error' in r) return { erro: r.error }
    revalidarFinanceiro()
    return { mensagem: `${p.tipo === 'INCOME' ? 'Receita' : 'Despesa'} de ${dinheiro(p.valor)} lançada em ${categoria}.` }
  },
}

/**
 * A receita que se recebe no PDV, e não pela baixa do Copilot (CY-02, CR-06):
 * a parcela do crediário e o a receber de uma venda (pacote, pré-pago, produto,
 * crédito interno, plano) ou de um atendimento — as chaves da comanda
 * (`CHAVES_DA_VENDA`, `parcelasEmAbertoDaCliente`). Devolve a recusa com o link
 * do PDV da cliente, na unidade do lançamento; null para o lançamento avulso.
 */
async function recebimentoDoPdv(c: ContextoDaFerramenta, id: string): Promise<string | null> {
  const tx = await ler(c.admin.from('financial_transactions')
    .select(['branch_id, client_id, appointment_id, parcela_total, parcela_grupo', ...CHAVES_DA_VENDA].join(', '))
    .eq('id', id).maybeSingle(), 'ver se o lançamento é do PDV') as Record<string, unknown> | null
  if (!tx) return null
  const daVenda = CHAVES_DA_VENDA.some(k => !!tx[k]) || !!tx.appointment_id || !!tx.parcela_grupo || Number(tx.parcela_total ?? 0) > 1
  if (!daVenda) return null
  const cliente = typeof tx.client_id === 'string' ? `&nova=1&cliente=${tx.client_id}` : ''
  const href = rota(c, `/pdv?unidade=${tx.branch_id as string}${cliente}`)
  return `Este lançamento é ${tx.parcela_grupo || Number(tx.parcela_total ?? 0) > 1 ? 'a parcela do crediário' : 'o a receber de uma venda ou de um atendimento'}: ele se recebe no PDV, e o Copilot não recebe. Diga isso e dê o link: [Receber no PDV](${href}).`
}

export const marcarPago: FerramentaDeEscrita<{ lancamento: string; forma?: string; bandeira?: string; vezes?: number; maquininha?: string }, { transactionId: string; forma: string | null; bandeira?: string | null; vezes?: number | null; maquininha?: string | null }> = {
  nome: 'marcar_pago',
  tipo: 'escrita',
  // Dar baixa é a régua da tela (markTransactionPaid, CX2): o Caixa em
  // Gerenciar, ou o Financeiro em Gerenciar.
  pode: podeDarBaixa,
  recurso: 'financeiro',
  descricao: 'Dá baixa (marca como pago agora) num lançamento AVULSO em aberto do financeiro (id, da ferramenta lancamentos) — a parcela do crediário e o a receber de uma venda ou de um atendimento não: esses se recebem no PDV, e a ferramenta devolve o link do PDV. Com a forma de pagamento (dinheiro, Pix, débito, crédito; na despesa, também boleto; obrigatória em toda receita — pergunte como foi pago — e na despesa sem forma) e, no cartão, a bandeira se a pessoa disser (Visa, Mastercard, Elo, Amex, Hipercard, Outras). Na receita recebida no crédito, as vezes se a pessoa disser ("recebeu no crédito em 3x" → vezes=3). No cartão, a maquininha pelo nome (ex.: Stone) quando a rede tem mais de uma — sem ela, a ferramenta pergunta.',
  parametros: z.object({ lancamento: UUID, forma: texto({ max: 30 }).optional(), bandeira: texto({ max: 30 }).optional(), vezes: z.number().int().min(1).max(LIMITE_DE_VEZES_NO_CARTAO).optional(), maquininha: texto({ max: 60 }).optional() }),
  async preparar(c, a) {
    const tx = await lancamentoAoAlcance(c.admin, c.ctx, a.lancamento)
    if (!tx) return { erro: 'Lançamento não encontrado.' }
    if (tx.is_paid) return { erro: 'Esse lançamento já está pago.' }
    if (tx.notes === 'Estornada') return { erro: 'Esse lançamento foi estornado.' }
    // CY-02 (o Copilot não vende nem recebe — 17/11; a parcela se recebe no
    // PDV, CR-06): a parcela do crediário e o a receber da venda ou do
    // atendimento vão ao PDV, com o link. Só o lançamento avulso tem baixa aqui.
    const doPdv = tx.type === 'INCOME' ? await recebimentoDoPdv(c, tx.id) : null
    if (doPdv) return { erro: doPdv }
    const forma = formaDePagamento(a.forma, tx.type === 'EXPENSE' ? 'EXPENSE' : 'INCOME')
    if (forma && typeof forma !== 'string') return forma
    // C34 (F67): sem meio no lançamento, a baixa pede a forma — como a tela.
    // PDV8: a receita pede a forma SEMPRE (o meio combinado não é o que entrou).
    if (!forma && (tx.type === 'INCOME' || !tx.payment_method)) return { erro: 'Pergunte como foi pago (dinheiro, Pix, débito, crédito ou boleto, na despesa): a baixa de uma receita sempre diz a forma.' }
    const bandeira = bandeiraDoPedido(a.bandeira, (forma as string | null) ?? tx.payment_method)
    if (bandeira && typeof bandeira !== 'string') return bandeira
    // F17-5: as vezes só no crédito da receita, até o limite da clínica (a regra da baixa da tela).
    // C75: a maquininha do cartão da receita (com mais de uma, pergunta qual).
    const maq = tx.type === 'INCOME' ? await maquininhaDoPedido(c, a.maquininha, (forma as string | null) ?? tx.payment_method) : null
    if (maq && 'erro' in maq) return maq
    const recusaDasVezes = await recusaDasVezesDaBaixa(c.ctx, tx.type, (forma as string | null) ?? tx.payment_method, a.vezes, maq?.id ?? null)
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
          ...(maq ? [{ rotulo: 'Maquininha', valor: maq.nome }] : []),
        ],
      },
      payload: { transactionId: tx.id, forma: forma as string | null, ...(bandeira ? { bandeira } : {}), ...(vezes ? { vezes } : {}), ...(maq ? { maquininha: maq.id } : {}) },
    }
  },
  async efetivar(c, p) {
    const tx = await lancamentoAoAlcance(c.admin, c.ctx, p.transactionId)
    if (!tx || tx.is_paid) return { erro: 'O lançamento mudou de situação. Confira no financeiro.' }
    const r = await marcarPagoCore(c.admin, c.ctx, p.transactionId, p.forma, p.bandeira ?? null, p.vezes ?? null, p.maquininha ?? null)
    if ('error' in r) return { erro: r.error }
    revalidarFinanceiro()
    return { mensagem: 'Baixa registrada.' }
  },
}

/** O produto da rede, pelo id ou pelo nome (tem de ser um só). */
type ProdutoAchado = {
  id: string; name: string; unit: string | null; consumption_unit: string | null; units_per_package: number | null
  cost_price?: number | null; sale_price?: number | null
}
async function resolverProduto(c: ContextoDaFerramenta, pedido: string): Promise<ProdutoAchado | { erro: string }> {
  const porId = UUID.safeParse(pedido)
  let q = c.admin.from('products').select('id, name, unit, consumption_unit, units_per_package, cost_price, sale_price').eq('tenant_id', c.ctx.tenantId!).eq('is_active', true)
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
async function saldoDoAjuste(c: ContextoDaFerramenta, productId: string, branchId: string): Promise<{ embalagens: number; consumo: string | null; rende: number | null; rendimento: number | null }> {
  const [linha, prod] = await Promise.all([
    ler(c.admin.from('branch_product_stock').select('current_stock, current_rendimento').eq('product_id', productId).eq('branch_id', branchId).maybeSingle(), 'ler o saldo') as Promise<{ current_stock: number; current_rendimento: number | null } | null>,
    ler(c.admin.from('products').select('consumption_unit, units_per_package').eq('id', productId).maybeSingle(), 'ler o produto') as Promise<{ consumption_unit: string | null; units_per_package: number | null } | null>,
  ])
  const rende = prod?.consumption_unit && Number(prod.units_per_package) > 0 ? Number(prod.units_per_package) : null
  const embalagens = Number(linha?.current_stock ?? 0)
  if (!rende) return { embalagens, consumo: null, rende: null, rendimento: null }
  const rend = linha?.current_rendimento != null ? Number(linha.current_rendimento) : embalagens * rende
  return { embalagens: Math.round(rend / rende * 10_000) / 10_000, consumo: prod!.consumption_unit!, rende, rendimento: rend }
}

interface ArgsEntrada { produto: string; quantidade: number; custoUnitario?: number; lote?: string; validade?: string; unidade?: string; observacao?: string; fornecedor?: string; marca?: string; notaFiscal?: string }
interface PayloadEntrada {
  productId: string; branchId: string; quantidade: number; custoUnitario: number | null; lote: string | null; validade: string | null; observacao: string | null
  fornecedor?: string | null; marca?: string | null; notaFiscal?: string | null
}

/**
 * O que a janela de Entrada diz (C5 do levantamento, F66): a regra da despesa
 * (D13 revisto — movimentação de estoque nunca gera despesa).
 */
const ENTRADA_SEM_DESPESA = 'Não gera despesa: o custo é a base do insumo, do valor em estoque e da margem. A compra que a rede pagou entra no Financeiro por um lançamento (categoria “Compra de estoque”).'
const num = (n: number, casas = 4) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas })

export const entradaDeEstoque: FerramentaDeEscrita<ArgsEntrada, PayloadEntrada> = {
  nome: 'entrada_de_estoque',
  tipo: 'escrita',
  modulo: 'stock', nivel: 'MANAGE',
  recurso: 'estoque',
  descricao: 'Registra a ENTRADA (compra/recebimento) de um produto numa unidade: quantidade em embalagens, custo unitário opcional, lote e validade (AAAA-MM-DD) opcionais, o fornecedor e a marca (os nomes; entram nas listas de Fornecedores e de Marcas da rede) e a nota fiscal, opcionais.',
  parametros: z.object({
    produto: texto({ min: 2, max: 80 }),
    // O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." A janela de Entrada
    // aceita qualquer quantidade acima de zero e o custo a partir de zero; os tetos (100.000 embalagens,
    // R$ 1.000.000) eram só do Copilot. Sobra o que o registro guarda (a quantidade na unidade de
    // consumo e o saldo depois se conferem no preparo, com o produto).
    quantidade: z.number().positive('Quantidade deve ser maior que zero.').max(LIMITE_DO_ESTOQUE, RECUSA_DA_QUANTIDADE_DO_ESTOQUE()),
    custoUnitario: z.number().min(0, 'O custo unitário não pode ser negativo.').max(LIMITE_DO_DINHEIRO, RECUSA_DO_DINHEIRO).optional(),
    // O lote e a observação da janela de Entrada não têm teto; a marca e o fornecedor têm
    // 120 (as listas da rede, criarItemDoEstoque), e a nota fiscal 60, como os campos dela.
    lote: z.string().optional(),
    validade: DATA.optional(),
    unidade: texto({ max: 80 }).optional(),
    observacao: z.string().optional(),
    fornecedor: texto({ max: 120 }).optional(),
    marca: texto({ max: 120 }).optional(),
    notaFiscal: texto({ max: 60 }).optional(),
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
    // O que o registro não guarda (o mesmo que a janela ouviria do banco): a quantidade na unidade do
    // movimento e o saldo depois. O saldo serve só à recusa — o cartão não o mostra (ele muda até o Confirmar).
    const antes = await saldoDoAjuste(c, p.id, u.unidade!.id)
    const recusaDoRegistro = recusaDoEstoqueAcimaDoRegistro({
      quantidade: a.quantidade, fator: rende ?? 1, medida: medidaNoPlural(un, 2) || 'embalagens', consumo: p.consumption_unit,
      saldoDepois: (antes.embalagens + a.quantidade) * (rende ?? 1),
    })
    if (recusaDoRegistro) return { erro: recusaDoRegistro }
    // A19 da 19ª: o custo fora do comum, o aviso da janela de Entrada (avisa; a entrada vale assim).
    const avisoDoCusto = avisoDoCustoDaEntrada(a.custoUnitario ?? null, { custo: p.cost_price, venda: p.sale_price })
    // C5 (F66): o cartão diz o que a janela de Entrada diz — a quantidade no
    // plural e no que rende, "Não gera despesa", e a validade que já passou
    // (avisa; a entrada vale assim, princípio 2).
    const vencida = !!a.validade && loteVencido(a.validade, new Date(), await fusoDaUnidade(c.ctx.tenantId, u.unidade!.id))
    const fornecedor = a.fornecedor?.trim().replace(/\s+/g, ' ') || null
    const marca = a.marca?.trim().replace(/\s+/g, ' ') || null
    const nota = a.notaFiscal?.trim() || null
    return {
      resumo: {
        titulo: 'Entrada de estoque',
        linhas: [
          { rotulo: 'Produto', valor: p.name },
          { rotulo: 'Quantidade', valor: `+${num(a.quantidade)} ${medidaNoPlural(un, a.quantidade)}${rende ? ` (${num(a.quantidade * rende)} ${p.consumption_unit})` : ''}`.trim() },
          ...(a.custoUnitario !== undefined ? [{ rotulo: 'Custo unitário', valor: dinheiro(a.custoUnitario) }] : []),
          ...(a.lote ? [{ rotulo: 'Lote', valor: `${a.lote}${a.validade ? ` · vence ${a.validade.split('-').reverse().join('/')}` : ''}` }] : []),
          ...(marca ? [{ rotulo: 'Marca', valor: marca }] : []),
          ...(fornecedor ? [{ rotulo: 'Fornecedor', valor: fornecedor }] : []),
          ...(nota ? [{ rotulo: 'Nota fiscal', valor: nota }] : []),
          { rotulo: 'Unidade', valor: u.unidade!.name },
        ],
        aviso: (vencida ? `Esta validade já passou (${validadeNaTela(a.validade!)}): o lote entra vencido. Confira a data na embalagem — se estiver certa, a entrada vale assim. ` : '')
          + (avisoDoCusto ? `${avisoDoCusto} ` : '')
          + ENTRADA_SEM_DESPESA,
      },
      payload: {
        productId: p.id, branchId: u.unidade!.id, quantidade: a.quantidade, custoUnitario: a.custoUnitario ?? null,
        lote: a.lote?.trim() || null, validade: a.validade ?? null, observacao: a.observacao?.trim() || null,
        fornecedor, marca, notaFiscal: nota,
      },
    }
  },
  async efetivar(c, p) {
    // O fornecedor e a marca vão em texto: o banco os resolve nas listas da rede
    // (o mesmo nome, sem caixa nem espaços, é o mesmo; o novo entra — C76, E14).
    const r = await entradaDeEstoqueCore(c.admin, c.ctx, p)
    if ('error' in r) return { erro: r.error }
    revalidar('estoque')
    return { mensagem: `Entrada registrada. Saldo agora: ${await saldoAgoraEmTexto(c.admin, p.productId, p.branchId)}.` }
  },
}

/** Para onde vai a diferença do ajuste (o que a janela de Ajuste diz). */
const destinoDaDiferenca = (delta: number) => [
  delta < 0
    ? 'A diferença sai do lote que vence primeiro e entra em Relatórios → Estoque, “Perdas no período”, como Inventário, ao custo do lote. Não gera despesa.'
    : 'A diferença entra num lote novo, sem número. Não gera despesa.',
  'Errado, se desfaz no Histórico (“Desfazer ajuste”).',
]

/**
 * D2 da 31ª (decisão do Claude, 26/11): o produto gravado com a embalagem e o
 * conteúdo que não fecham ("1 g com 1000 g") — a contagem em "g" pode ser das
 * duas. O cartão diz o que ela conta, e onde se corrige.
 */
function avisoDoCadastroDaEmbalagem(p: ProdutoAchado): string | null {
  if (!recusaDaEmbalagem(p.unit, p.units_per_package, p.consumption_unit)) return null
  const n = num(Number(p.units_per_package))
  return `O cadastro deste produto diz “1 ${p.unit} com ${n} ${p.consumption_unit}”: em embalagens, cada uma tem ${n} ${p.consumption_unit}. Se a contagem é na medida de uso, conte em consumo. Corrija a embalagem no cadastro do produto.`
}

/**
 * O ajuste contado na medida de uso — o "Contar em: g" da janela de Ajuste
 * (`ajusteDeEstoqueCore` com `emConsumo`: a contagem exata nela).
 */
function ajusteEmConsumo(
  p: ProdutoAchado, unidade: { id: string; name: string },
  s: { embalagens: number; consumo: string; rende: number; rendimento: number },
  a: { novoSaldo: number; motivo: string },
) {
  const recusaDoRegistro = recusaDoEstoqueAcimaDoRegistro({ quantidade: a.novoSaldo, fator: 1, medida: s.consumo })
  if (recusaDoRegistro) return { erro: recusaDoRegistro }
  const saldo = s.rendimento
  if (Math.abs(saldo - a.novoSaldo) < 1e-9) return { erro: `O saldo de ${p.name} já é ${num(saldo)} ${s.consumo}.` }
  const delta = a.novoSaldo - saldo
  const pct = saldo > 0 ? Math.abs(delta) / saldo * 100 : null
  const un = p.unit ?? ''
  const emEmbalagens = (q: number) => num(Math.round(q / s.rende * 10_000) / 10_000)
  const aviso = [
    avisoDoCadastroDaEmbalagem(p),
    pct !== null && pct > 50
      ? `A contagem muda o saldo em ${num(pct, 0)}%. Confira se contou na unidade certa: a contagem está em ${s.consumo} (${num(a.novoSaldo)} ${s.consumo} são ${emEmbalagens(a.novoSaldo)} ${medidaNoPlural(un, a.novoSaldo / s.rende)}).`
      : null,
    ...destinoDaDiferenca(delta),
  ].filter(Boolean).join(' ')
  return {
    resumo: {
      titulo: 'Ajustar estoque',
      linhas: [
        { rotulo: 'Produto', valor: p.name },
        { rotulo: 'Saldo', valor: `${num(saldo)} → ${num(a.novoSaldo)} ${s.consumo} (${emEmbalagens(saldo)} → ${emEmbalagens(a.novoSaldo)} ${un})`.trim() },
        { rotulo: 'Motivo', valor: a.motivo.trim() },
        { rotulo: 'Unidade', valor: unidade.name },
      ],
      aviso,
    },
    payload: { productId: p.id, branchId: unidade.id, novoSaldo: a.novoSaldo, motivo: a.motivo.trim(), emConsumo: true },
  }
}

export const ajusteDeEstoque: FerramentaDeEscrita<{ produto: string; novoSaldo: number; motivo: string; unidade?: string; contarEm?: 'embalagem' | 'consumo' }, { productId: string; branchId: string; novoSaldo: number; motivo: string; emConsumo?: boolean }> = {
  nome: 'ajuste_de_estoque',
  tipo: 'escrita',
  modulo: 'stock', nivel: 'MANAGE',
  recurso: 'estoque',
  descricao: 'Corrige o saldo de um produto numa unidade para o número CONTADO (inventário), com o motivo (obrigatório). Como o "Contar em" da janela de Ajuste, a contagem vale em embalagens (frasco, caixa…: o padrão) ou, com contarEm="consumo", na medida de uso do produto (g, ml, UI…): quando a pessoa disser a medida ("950 g"), conte nela.',
  parametros: z.object({
    produto: texto({ min: 2, max: 80 }),
    // O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." A janela de Ajuste
    // recusa só o negativo; o teto de 1.000.000 era só do Copilot. Sobra o que o registro guarda (na
    // unidade de consumo, conferido no preparo).
    novoSaldo: z.number().min(0, 'Novo estoque não pode ser negativo.').max(LIMITE_DO_ESTOQUE, RECUSA_DA_QUANTIDADE_DO_ESTOQUE()),
    // O motivo, como a janela de Ajuste: só que exista, sem teto.
    motivo: texto({ min: 1, seCurto: 'Motivo do ajuste é obrigatório.' }),
    unidade: texto({ max: 80 }).optional(),
    // D2 da 31ª (princípio 3): a medida da contagem, a mesma escolha da janela ("Contar em: pote | g").
    contarEm: z.enum(['embalagem', 'consumo']).optional(),
  }),
  async preparar(c, a) {
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const p = await resolverProduto(c, a.produto)
    if ('erro' in p) return { erro: p.erro }
    const s = await saldoDoAjuste(c, p.id, u.unidade!.id)
    // D2 da 31ª: "ajusta para 950 g" é a contagem em g — 950 potes viravam 950.000 g.
    if (a.contarEm === 'consumo' && s.rende && s.consumo && s.rendimento != null) {
      return ajusteEmConsumo(p, u.unidade!, { embalagens: s.embalagens, consumo: s.consumo, rende: s.rende, rendimento: s.rendimento }, a)
    }
    // A contagem é o saldo novo do movimento, na unidade de consumo quando o produto tem uma.
    const recusaDoRegistro = recusaDoEstoqueAcimaDoRegistro({
      quantidade: a.novoSaldo, fator: s.rende ?? 1, medida: medidaNoPlural(p.unit ?? '', 2) || 'embalagens', consumo: s.consumo,
    })
    if (recusaDoRegistro) return { erro: recusaDoRegistro }
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
      avisoDoCadastroDaEmbalagem(p),
      pct !== null && pct > 50
        ? `A contagem muda o saldo em ${num(pct, 0)}%. Confira se contou na unidade certa: a contagem está em ${medidaNoPlural(un, 2)}${naOutra}.`
        : null,
      ...destinoDaDiferenca(delta),
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

interface ArgsOportunidade { nome?: string; cliente?: string; telefone?: string; email?: string; origem?: string; interesse?: string[]; observacao?: string; funil?: string; valor?: number; responsavel?: string }
interface PayloadOportunidade {
  nome: string; telefone: string | null; email: string | null; origem: string | null; procedureIds: string[]; observacoes: string | null; funnelId: string | null
  valor?: number; responsavelId?: string
  /** D11: as fichas ativas com este telefone — a escolha "mesma:<id>" liga a oportunidade a uma. */
  fichas?: string[]
  /** D3 da 34ª: a cliente pedida (a ficha achada pela busca) — a oportunidade nasce ligada a ela, como o "Sim" da janela. */
  clientId?: string
}

export const criarOportunidade: FerramentaDeEscrita<ArgsOportunidade, PayloadOportunidade> = {
  nome: 'criar_oportunidade',
  tipo: 'escrita',
  modulo: 'crm', nivel: 'MANAGE',
  recurso: 'oportunidades',
  descricao: 'Cria uma oportunidade no funil. De quem já é cliente: passe cliente (o id achado pela busca, o nome ou o telefone) — o nome, o telefone e o e-mail vêm da ficha, e a oportunidade nasce ligada a ela. De quem não é: nome (o da PESSOA, nunca o assunto: "Pacote de drenagem" vai em interesse ou observacao) e ao menos um contato (telefone ou e-mail). Origem, procedimentos de interesse, observação, funil (nome), valor estimado em reais e responsável (nome de um membro da equipe) opcionais. Nasce na primeira etapa; sem responsável, você é o responsável.',
  parametros: z.object({
    // O nome e o e-mail, como a janela: o nome só que exista, o e-mail sem teto (`leads.name` e
    // `leads.email` são text, como na ficha — 20261208000001). A origem tem o do registro
    // (`leads.source`, varchar(60)).
    nome: texto({ min: 1, seCurto: 'Nome é obrigatório.' }).optional(),
    // D3 da 34ª: a cliente achada (id, nome ou telefone) — o nome e o contato saem da ficha.
    cliente: texto({ min: 2, max: 120 }).optional(),
    telefone: texto({ min: 8, max: 20, seCurto: TELEFONE_INCOMPLETO }).optional(),
    email: z.string().optional(),
    origem: texto({ max: 60, seLongo: acimaDoRegistro(60, 'caracteres') }).optional(),
    // O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito." A janela da
    // oportunidade não limita os procedimentos de interesse (eram 5 só no Copilot) e aceita o valor
    // estimado zero (lerValorEstimado recusa só o negativo). Sobra o que o registro guarda.
    interesse: z.array(texto({ max: 80 })).optional(),
    // A observação da janela não tem teto (`leads.notes` é texto).
    observacao: z.string().optional(),
    funil: texto({ max: 80 }).optional(),
    valor: z.number().min(0, 'O valor estimado não pode ser negativo.').max(LIMITE_DO_VALOR_DA_OPORTUNIDADE, RECUSA_DO_VALOR_DA_OPORTUNIDADE).optional(),
    responsavel: texto({ min: 2, max: 120 }).optional(),
  }),
  async preparar(c, a) {
    // D3 da 34ª (CX-10): a oportunidade de quem já é cliente é a da ficha — o nome, o telefone e o
    // e-mail dela, ligada a ela (o "Sim, é a mesma pessoa" da janela). Achar a ficha pede Clientes em Ver.
    let ficha: { id: string; name: string; phone: string | null; email: string | null } | null = null
    if (a.cliente) {
      if (!can(c.ctx, 'clients', 'VIEW')) return { erro: 'Sua permissão não abre as fichas de clientes: diga o nome e o telefone ou o e-mail da pessoa.' }
      const cl = await resolverCliente(c, a.cliente, { apenasAtivos: true })
      if ('erro' in cl) return { erro: cl.erro }
      const contato = await ler(c.admin.from('clients').select('email').eq('id', cl.id).eq('tenant_id', c.ctx.tenantId!).maybeSingle(),
        'ler o contato da cliente') as { email: string | null } | null
      ficha = { id: cl.id, name: cl.name, phone: cl.phone, email: contato?.email ?? null }
    }
    const nome = (ficha?.name ?? a.nome ?? '').trim()
    if (!nome) return { erro: 'Nome é obrigatório.' }
    const telefoneDito = a.telefone ?? ficha?.phone ?? undefined
    const emailDito = a.email ?? ficha?.email ?? undefined
    if (!telefoneDito && !emailDito) return { erro: ficha ? `A ficha de ${ficha.name} não tem telefone nem e-mail: qual o telefone ou o e-mail?` : 'Qual o telefone ou o e-mail?' }
    // Escolher o responsável é a mesma trava da tela: CRM em Gerenciar.
    let responsavel: { id: string; name: string } | null = null
    if (a.responsavel) {
      if (!podeTrocarResponsavel(c.ctx)) return { erro: 'Sua permissão não escolhe o responsável da oportunidade: ela nasce com você.' }
      const r = await resolverMembro(c, a.responsavel)
      if ('erro' in r) return { erro: r.erro }
      responsavel = r
    }
    // A origem é a da lista da tela — as origens da CLÍNICA (A14 da 7ª,
    // Configurar funis): fora dela, o indicador por origem quebra.
    let origem: string | null = null
    if (a.origem) {
      const daRede = (await origensDaRede(c.admin, c.ctx.tenantId!)).map(o => o.nome)
      origem = daRede.find(k => semAcento(k) === semAcento(a.origem!)) ?? null
      if (!origem) return { erro: `Origem "${a.origem}" não existe. Origens: ${daRede.join(', ')}.` }
    }
    // O incompleto é recusado e o número vai no formato do WhatsApp (C28, F70).
    let digitos = ''
    if (telefoneDito) {
      const t = telefoneParaGravar(telefoneDito)
      if ('error' in t) {
        // O telefone da ficha que não se reconhece não barra: vai o e-mail dela, se houver.
        if (a.telefone || !emailDito) return { erro: t.error }
      } else digitos = t.fone ?? ''
    }
    // D11 da 9ª, como o "Novo lead" (C5, F70): o telefone de uma CLIENTE
    // pergunta "É a mesma pessoa?"; o "Sim" liga a oportunidade à ficha. A
    // cliente pedida já disse quem é (D3 da 34ª): sem a pergunta.
    const fichas = digitos && !ficha ? (await fichasDoTelefoneDoLead(c.ctx.tenantId!, digitos)).slice(0, 3) : []
    const veNomes = can(c.ctx, 'clients', 'VIEW')
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
          { rotulo: 'Nome', valor: nome },
          ...(digitos ? [{ rotulo: 'Telefone', valor: telefoneDaFichaImportada(digitos) }] : []),
          ...(emailDito ? [{ rotulo: 'E-mail', valor: emailDito.trim() }] : []),
          ...(procs.length ? [{ rotulo: 'Interesse', valor: procs.map(p => p.name).join(', ') }] : []),
          ...(origem ? [{ rotulo: 'Origem', valor: origem }] : []),
          ...(funil ? [{ rotulo: 'Funil', valor: funil.name }] : []),
          ...(a.valor !== undefined ? [{ rotulo: 'Valor', valor: dinheiro(a.valor) }] : []),
          ...(responsavel ? [{ rotulo: 'Responsável', valor: responsavel.name }] : []),
        ],
        ...(fichas.length ? {
          aviso: veNomes
            ? `Este telefone é da ficha de ${fichas.map(f => f.nome).join(', ')}. É a mesma pessoa? Com o “Sim”, a oportunidade nasce ligada à ficha.`
            : 'Este telefone é de uma cliente da rede. É a mesma pessoa? Com o “Sim”, a oportunidade nasce ligada à ficha.',
          escolhas: [
            ...fichas.map(f => ({ chave: `mesma:${f.id}`, rotulo: veNomes ? `Sim, é ${f.nome}` : 'Sim, é a mesma pessoa' })),
            { chave: 'outra', rotulo: 'Não, é outra pessoa' },
          ],
        } : {}),
      },
      payload: {
        nome, telefone: digitos || null, fichas: fichas.map(f => f.id), email: emailDito?.trim().toLowerCase() || null,
        ...(ficha ? { clientId: ficha.id } : {}),
        origem, procedureIds: procs.map(p => p.id), observacoes: a.observacao?.trim() || null, funnelId: funil?.id ?? null,
        ...(a.valor !== undefined ? { valor: a.valor } : {}),
        ...(responsavel ? { responsavelId: responsavel.id } : {}),
      },
    }
  },
  async efetivar(c, p, escolha) {
    // A ficha escolhida tem de ser uma das que o cartão ofereceu.
    const mesma = escolha?.startsWith('mesma:') ? escolha.slice(6) : null
    if (mesma && !(p.fichas ?? []).includes(mesma)) return { erro: 'A ficha deste telefone não foi encontrada.' }
    const r = await criarOportunidadeCore(c.admin, c.ctx, {
      nome: p.nome, telefone: p.telefone, email: p.email, origem: p.origem, observacoes: p.observacoes,
      procedureIds: p.procedureIds, funnelId: p.funnelId, valor: p.valor ?? null,
    }, mesma ? { clientId: mesma } : p.clientId ? { clientId: p.clientId } : {})
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

/**
 * A35 da 22ª (o Heitor: "se mover os cards manualmente dispararia automacoes,
 * perguntar se deseja disparar ou nao"; "Também ao arrastar um"): o Copilot
 * move a pedido da pessoa, então o cartão diz quais automações o movimento
 * dispara (a régua da tela, `automacoesQueOMovimentoDispara`) e dá "Disparar"
 * ou "Não disparar". No "Não", o movimento se grava e o fato não vai ao motor.
 */
const ESCOLHAS_DO_MOVIMENTO = [
  { chave: 'disparar', rotulo: 'Disparar' },
  { chave: 'nao-disparar', rotulo: 'Não disparar' },
]

async function automacoesDoMovimento(c: ContextoDaFerramenta, leadId: string, stageId: string): Promise<string[]> {
  const card = await ler(c.admin.from('leads').select(COLUNAS_DO_CARD_PARA_PREVER)
    .eq('id', leadId).eq('tenant_id', c.ctx.tenantId!).maybeSingle(), 'ler a oportunidade para prever as automações') as unknown as CardParaPrever | null
  return card ? automacoesQueOMovimentoDispara(c.ctx, [card], stageId) : []
}

export const moverEtapa: FerramentaDeEscrita<{ oportunidade: string; etapa: string }, { leadId: string; stageId: string; funnelId: string; automacoes?: string[] }> = {
  nome: 'mover_etapa',
  tipo: 'escrita',
  modulo: 'crm', nivel: 'MANAGE',
  recurso: 'oportunidades',
  descricao: 'Move uma oportunidade (id, da ferramenta oportunidades) para outra etapa do MESMO funil (nome da etapa — inclusive as de ganho ou perda).',
  parametros: z.object({ oportunidade: UUID, etapa: texto({ min: 2, max: 80 }) }),
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
    const automacoes = await automacoesDoMovimento(c, a.oportunidade, destino.id)
    return {
      resumo: {
        titulo: 'Mover oportunidade',
        linhas: [
          { rotulo: 'Oportunidade', valor: lead.name },
          { rotulo: 'De', valor: atual.name },
          { rotulo: 'Para', valor: destino.name },
        ],
        ...(automacoes.length ? { aviso: perguntaDasAutomacoes(automacoes), escolhas: ESCOLHAS_DO_MOVIMENTO } : {}),
      },
      payload: { leadId: a.oportunidade, stageId: destino.id, funnelId: atual.funnel_id, automacoes },
    }
  },
  async efetivar(c, p, escolha) {
    // O mundo mudou desde o cartão? Uma automação que passou a disparar sem a
    // pessoa ter escolhido não dispara calada: o cartão é refeito.
    const perguntou = !!p.automacoes?.length
    if (perguntou && escolha !== 'disparar' && escolha !== 'nao-disparar') return { erro: 'Escolha no cartão: disparar ou não as automações.' }
    if (!perguntou && (await automacoesDoMovimento(c, p.leadId, p.stageId)).length) {
      return { erro: 'Uma automação passou a disparar com este movimento. Peça de novo para eu perguntar se dispara.' }
    }
    const r = await moverEtapaCore(c.admin, c.ctx, p.leadId, p.stageId, { semDespachar: escolha === 'nao-disparar' })
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
  // A trava da tela (`podeTrocarResponsavel`).
  pode: podeTrocarResponsavel,
  descricao: 'Troca o responsável de uma oportunidade (id, da ferramenta oportunidades) por outro membro ativo da equipe (nome), ou tira o responsável (responsavel = null).',
  parametros: z.object({ oportunidade: UUID, responsavel: texto({ min: 2, max: 120 }).nullable() }),
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
