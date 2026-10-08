import 'server-only'
import { z } from 'zod/v4'
import { revalidatePath } from 'next/cache'
import { isOwnScope, ownerFilter } from '@/lib/auth'
import { LEAD_SOURCE_KEYS, maskPhone, unitTag } from '@estetica-os/utils'
import { ler } from '@/lib/db'
import { dayKeyTZ } from '@/lib/datetime'
import { lancarCore, marcarPagoCore, lancamentoAoAlcance, CATEGORIAS_DE_DESPESA, CATEGORIAS_DE_RECEITA, FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { entradaDeEstoqueCore, ajusteDeEstoqueCore } from '@/lib/estoque/movimentos'
import { criarOportunidadeCore, moverEtapaCore } from '@/lib/crm/oportunidade'
import { leadAoAlcance } from '@/lib/crm/alcance'
import { rotaOportunidade } from '@/lib/rotas'
import type { ContextoDaFerramenta, FerramentaDeEscrita } from '@/lib/copilot/ferramentas/tipos'
import { DATA, UUID, dinheiro, resolverProcedimento, resolverUnidade } from '@/lib/copilot/ferramentas/comum'

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
function categoria(tipo: 'receita' | 'despesa', pedida: string): string | { erro: string } {
  const lista: readonly string[] = tipo === 'receita' ? CATEGORIAS_DE_RECEITA : CATEGORIAS_DE_DESPESA
  const achada = lista.find(c => semAcento(c) === semAcento(pedida)) ?? lista.find(c => semAcento(c).includes(semAcento(pedida)))
  return achada ?? { erro: `Categoria de ${tipo} "${pedida}" não existe. Categorias: ${lista.join(', ')}.` }
}
// Os dois portais: a rede e a unidade (o mesmo que a tela revalida).
const revalidar = (tela: string) => { revalidatePath(`/admin/${tela}`); revalidatePath(`/[slug]/${tela}`, 'page') }
const revalidarFinanceiro = () => revalidar('financeiro')

interface ArgsLancar { tipo: 'receita' | 'despesa'; descricao: string; valor: number; categoria: string; vencimento?: string; pago?: boolean; forma?: string; unidade?: string }
interface PayloadLancar { branchId: string; tipo: 'INCOME' | 'EXPENSE'; categoria: string; descricao: string; valor: number; forma: string | null; vencimento: string | null; pago: boolean }

export const lancar: FerramentaDeEscrita<ArgsLancar, PayloadLancar> = {
  nome: 'lancar',
  tipo: 'escrita',
  modulo: 'financial', nivel: 'MANAGE',
  pode: ctx => !isOwnScope(ctx, 'financial'),
  recurso: 'financeiro',
  descricao: `Lança uma receita ou despesa avulsa (não ligada a atendimento): descrição, valor em reais, categoria (receita: ${CATEGORIAS_DE_RECEITA.join(', ')}; despesa: ${CATEGORIAS_DE_DESPESA.join(', ')}), vencimento (AAAA-MM-DD) se for a pagar/receber, ou pago=true com a forma (dinheiro, Pix, débito, crédito).`,
  parametros: z.object({
    tipo: z.enum(['receita', 'despesa']),
    descricao: z.string().min(2).max(200),
    valor: z.number().positive().max(10_000_000),
    categoria: z.string().min(2).max(60),
    vencimento: DATA.optional(),
    pago: z.boolean().optional(),
    forma: z.string().max(30).optional(),
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
    const valor = Math.round(a.valor * 100) / 100
    return {
      resumo: {
        titulo: a.tipo === 'receita' ? 'Lançar receita' : 'Lançar despesa',
        linhas: [
          { rotulo: 'Descrição', valor: a.descricao.trim() },
          { rotulo: 'Valor', valor: dinheiro(valor) },
          { rotulo: 'Categoria', valor: cat },
          { rotulo: 'Situação', valor: pago ? `pago${forma ? ` · ${FORMA_LEGIVEL[forma]}` : ''}` : `vence ${a.vencimento!.split('-').reverse().join('/')}` },
          { rotulo: 'Unidade', valor: u.unidade!.name },
        ],
      },
      payload: {
        branchId: u.unidade!.id, tipo: a.tipo === 'receita' ? 'INCOME' : 'EXPENSE', categoria: cat,
        descricao: a.descricao.trim(), valor, forma: forma as string | null, vencimento: a.vencimento ?? null, pago,
      },
    }
  },
  async efetivar(c, p) {
    const r = await lancarCore(c.admin, c.ctx, {
      branchId: p.branchId, tipo: p.tipo, categoria: p.categoria, descricao: p.descricao, valor: p.valor,
      formaDePagamento: p.forma, vencimento: p.vencimento, pago: p.pago,
    })
    if ('error' in r) return { erro: r.error }
    revalidarFinanceiro()
    return { mensagem: `${p.tipo === 'INCOME' ? 'Receita' : 'Despesa'} de ${dinheiro(p.valor)} lançada.` }
  },
}

export const marcarPago: FerramentaDeEscrita<{ lancamento: string; forma?: string }, { transactionId: string; forma: string | null }> = {
  nome: 'marcar_pago',
  tipo: 'escrita',
  // Dar baixa é do CAIXA, como na tela (markTransactionPaid). Com o
  // podeReceber, quem só tem o financeiro — até o "só as próprias comissões" —
  // dava baixa em qualquer lançamento da unidade.
  modulo: 'cashier', nivel: 'MANAGE',
  recurso: 'financeiro',
  descricao: 'Dá baixa (marca como pago agora) num lançamento em aberto (id, da ferramenta lancamentos), com a forma de pagamento opcional (dinheiro, Pix, débito, crédito).',
  parametros: z.object({ lancamento: UUID, forma: z.string().max(30).optional() }),
  async preparar(c, a) {
    const tx = await lancamentoAoAlcance(c.admin, c.ctx, a.lancamento)
    if (!tx) return { erro: 'Lançamento não encontrado.' }
    if (tx.is_paid) return { erro: 'Esse lançamento já está pago.' }
    if (tx.notes === 'Estornada') return { erro: 'Esse lançamento foi estornado.' }
    const forma = formaDePagamento(a.forma)
    if (forma && typeof forma !== 'string') return forma
    return {
      resumo: {
        titulo: 'Dar baixa no lançamento',
        linhas: [
          { rotulo: 'Lançamento', valor: tx.description ?? tx.category ?? '—' },
          { rotulo: 'Valor', valor: dinheiro(tx.amount) },
          ...(tx.due_date ? [{ rotulo: 'Vencimento', valor: dayKeyTZ(tx.due_date).split('-').reverse().join('/') }] : []),
          ...(forma ? [{ rotulo: 'Forma', valor: FORMA_LEGIVEL[forma as string]! }] : []),
        ],
      },
      payload: { transactionId: tx.id, forma: forma as string | null },
    }
  },
  async efetivar(c, p) {
    const tx = await lancamentoAoAlcance(c.admin, c.ctx, p.transactionId)
    if (!tx || tx.is_paid) return { erro: 'O lançamento mudou de situação. Confira no financeiro.' }
    const r = await marcarPagoCore(c.admin, c.ctx, p.transactionId, p.forma)
    if ('error' in r) return { erro: r.error }
    revalidarFinanceiro()
    return { mensagem: 'Baixa registrada.' }
  },
}

/** O produto da rede, pelo id ou pelo nome (tem de ser um só). */
async function resolverProduto(c: ContextoDaFerramenta, pedido: string): Promise<{ id: string; name: string; unit: string | null } | { erro: string }> {
  const porId = UUID.safeParse(pedido)
  let q = c.admin.from('products').select('id, name, unit').eq('tenant_id', c.ctx.tenantId!).eq('is_active', true)
  q = porId.success ? q.eq('id', pedido) : q.ilike('name', `%${pedido.replace(/[%_\\]/g, '')}%`)
  const achados = (await ler(q.limit(8), 'procurar o produto') as { id: string; name: string; unit: string | null }[] | null) ?? []
  const exato = achados.filter(p => p.name.toLowerCase() === pedido.trim().toLowerCase())
  if (achados.length === 1) return achados[0]!
  if (exato.length === 1) return exato[0]!
  if (!achados.length) return { erro: `Produto "${pedido}" não encontrado.` }
  return { erro: `Mais de um produto com "${pedido}": ${achados.map(p => p.name).join(', ')}. Qual?` }
}

async function saldoNaUnidade(c: ContextoDaFerramenta, productId: string, branchId: string): Promise<number> {
  const linha = await ler(c.admin.from('branch_product_stock').select('current_stock').eq('product_id', productId).eq('branch_id', branchId).maybeSingle(), 'ler o saldo') as { current_stock: number } | null
  return Number(linha?.current_stock ?? 0)
}

interface ArgsEntrada { produto: string; quantidade: number; custoUnitario?: number; lote?: string; validade?: string; unidade?: string; observacao?: string }
interface PayloadEntrada { productId: string; branchId: string; quantidade: number; custoUnitario: number | null; lote: string | null; validade: string | null; observacao: string | null }

export const entradaDeEstoque: FerramentaDeEscrita<ArgsEntrada, PayloadEntrada> = {
  nome: 'entrada_de_estoque',
  tipo: 'escrita',
  modulo: 'stock', nivel: 'MANAGE',
  recurso: 'estoque',
  descricao: 'Registra a ENTRADA (compra/recebimento) de um produto numa unidade: quantidade em embalagens, custo unitário opcional, lote e validade (AAAA-MM-DD) opcionais.',
  parametros: z.object({
    produto: z.string().min(2).max(80),
    quantidade: z.number().positive().max(100_000),
    custoUnitario: z.number().positive().max(1_000_000).optional(),
    lote: z.string().max(60).optional(),
    validade: DATA.optional(),
    unidade: z.string().max(80).optional(),
    observacao: z.string().max(200).optional(),
  }),
  async preparar(c, a) {
    const u = await resolverUnidade(c, a.unidade, { exigir: true })
    if ('erro' in u) return { erro: u.erro }
    const p = await resolverProduto(c, a.produto)
    if ('erro' in p) return { erro: p.erro }
    // Sem o saldo no cartão: ele muda com o consumo até o Confirmar, e a entrada
    // continua valendo (o saldo novo vem na mensagem do resultado).
    const un = p.unit ?? ''
    return {
      resumo: {
        titulo: 'Entrada de estoque',
        linhas: [
          { rotulo: 'Produto', valor: p.name },
          { rotulo: 'Quantidade', valor: `+${a.quantidade} ${un}`.trim() },
          ...(a.custoUnitario ? [{ rotulo: 'Custo unitário', valor: dinheiro(a.custoUnitario) }] : []),
          ...(a.lote ? [{ rotulo: 'Lote', valor: `${a.lote}${a.validade ? ` · vence ${a.validade.split('-').reverse().join('/')}` : ''}` }] : []),
          { rotulo: 'Unidade', valor: u.unidade!.name },
        ],
      },
      payload: {
        productId: p.id, branchId: u.unidade!.id, quantidade: a.quantidade, custoUnitario: a.custoUnitario ?? null,
        lote: a.lote?.trim() || null, validade: a.validade ?? null, observacao: a.observacao?.trim() || null,
      },
    }
  },
  async efetivar(c, p) {
    const r = await entradaDeEstoqueCore(c.admin, c.ctx, p)
    if ('error' in r) return { erro: r.error }
    revalidar('estoque')
    return { mensagem: `Entrada registrada. Saldo agora: ${r.saldo}.` }
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
    const saldo = await saldoNaUnidade(c, p.id, u.unidade!.id)
    if (saldo === a.novoSaldo) return { erro: `O saldo de ${p.name} já é ${saldo}.` }
    return {
      resumo: {
        titulo: 'Ajustar estoque',
        linhas: [
          { rotulo: 'Produto', valor: p.name },
          { rotulo: 'Saldo', valor: `${saldo} → ${a.novoSaldo} ${p.unit ?? ''}`.trim() },
          { rotulo: 'Motivo', valor: a.motivo.trim() },
          { rotulo: 'Unidade', valor: u.unidade!.name },
        ],
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

interface ArgsOportunidade { nome: string; telefone?: string; email?: string; origem?: string; interesse?: string[]; observacao?: string; funil?: string }
interface PayloadOportunidade { nome: string; telefone: string | null; email: string | null; origem: string | null; procedureIds: string[]; observacoes: string | null; funnelId: string | null; tags: string[] }

export const criarOportunidade: FerramentaDeEscrita<ArgsOportunidade, PayloadOportunidade> = {
  nome: 'criar_oportunidade',
  tipo: 'escrita',
  modulo: 'crm', nivel: 'MANAGE',
  recurso: 'oportunidades',
  descricao: 'Cria uma oportunidade (lead) no funil: nome e ao menos um contato (telefone ou e-mail); origem, procedimentos de interesse, observação e funil (nome) opcionais. Nasce na primeira etapa, com você de responsável.',
  parametros: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(8).max(20).optional(),
    email: z.string().max(160).optional(),
    origem: z.string().max(60).optional(),
    interesse: z.array(z.string().max(80)).max(5).optional(),
    observacao: z.string().max(300).optional(),
    funil: z.string().max(80).optional(),
  }),
  async preparar(c, a) {
    if (!a.telefone && !a.email) return { erro: 'Qual o telefone ou o e-mail?' }
    // A origem é a da lista da tela: fora dela, o indicador por origem quebra.
    let origem: string | null = null
    if (a.origem) {
      origem = LEAD_SOURCE_KEYS.find(k => semAcento(k) === semAcento(a.origem!)) ?? null
      if (!origem) return { erro: `Origem "${a.origem}" não existe. Origens: ${LEAD_SOURCE_KEYS.join(', ')}.` }
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
        ],
      },
      payload: {
        nome: a.nome.trim(), telefone: digitos ? maskPhone(digitos) : null, email: a.email?.trim().toLowerCase() || null,
        origem, procedureIds: procs.map(p => p.id), observacoes: a.observacao?.trim() || null, funnelId: funil?.id ?? null, tags,
      },
    }
  },
  async efetivar(c, p) {
    const r = await criarOportunidadeCore(c.admin, c.ctx, {
      nome: p.nome, telefone: p.telefone, email: p.email, origem: p.origem, observacoes: p.observacoes,
      procedureIds: p.procedureIds, funnelId: p.funnelId, tags: p.tags,
    })
    if ('error' in r) return { erro: r.error }
    revalidar('oportunidades')
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
