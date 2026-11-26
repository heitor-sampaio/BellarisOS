import 'server-only'
import { z } from 'zod/v4'
import { ler, lerTodas } from '@/lib/db'
import { addDaysTZ, dayKeyTZ } from '@/lib/datetime'
import { rotaOportunidade } from '@/lib/rotas'
import { loteVencido } from '@/lib/estoque/validade'
import { medidaNoPlural } from '@/lib/estoque/medidas'
import { saldoNaPrateleira } from '@/lib/estoque/saldo-em-texto'
import { formatarQuantidade, minimoEhDoCadastro, saldoDoLoteNaTela, situacaoDoEstoque } from '@/lib/estoque/situacao'
import type { ContextoDaFerramenta, FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { DATA, UUID, dinheiro, fusoDe, fusosPorUnidade, hojeNoFuso, idsDasUnidades, janelaDoDia, nomesPorId, ondeProcurou, resolverUnidade, unidadesDaRede, type Unidade } from '@/lib/copilot/ferramentas/comum'

/**
 * As leituras de FINANCEIRO, ESTOQUE e OPORTUNIDADES.
 *
 * Lista, não soma: total de dinheiro é indicador (`indicadores`, que vem de
 * lib/metrics, §13.1) — somar aqui seria uma regra própria de receita.
 */

const FORMA: Record<string, string> = { CASH: 'dinheiro', PIX: 'Pix', DEBIT_CARD: 'débito', CREDIT_CARD: 'crédito', INTERNAL_CREDIT: 'crédito interno', BOLETO: 'boleto' }

export const lancamentos: FerramentaDeLeitura<{
  tipo?: 'receita' | 'despesa'; situacao?: 'em_aberto' | 'vencidos' | 'pagos' | 'todos'; de?: string; ate?: string; unidade?: string; cliente?: string
}> = {
  nome: 'lancamentos',
  tipo: 'leitura',
  modulo: 'financial', nivel: 'VIEW',
  descricao: 'Lançamentos financeiros (contas a receber e a pagar): em aberto (padrão), vencidos, pagos ou todos; receita ou despesa; por período (vencimento, ou pagamento quando "pagos"), unidade ou cliente (id). Até 50. Para TOTAIS do período use a ferramenta indicadores — nunca some estas linhas: a despesa e a receita do período na aba overview; por unidade e por categoria na aba financeiro (despesaPorUnidade, despesaPorCategoria; receitaPorUnidade, receitaPorCategoria). O estorno (tipo "estorno") é o contra-lançamento de um pagamento desfeito: não é despesa nem receita, e fica de fora quando o pedido é só despesa ou só receita.',
  parametros: z.object({
    tipo: z.enum(['receita', 'despesa']).optional(),
    situacao: z.enum(['em_aberto', 'vencidos', 'pagos', 'todos']).optional(),
    de: DATA.optional(), ate: DATA.optional(),
    unidade: z.string().max(80).optional(),
    cliente: UUID.optional(),
  }),
  async executar(c, args) {
    // Sem unidade no pedido, em todas as da pessoa (D4 da 18ª).
    const u = await resolverUnidade(c, args.unidade, { paraLer: true })
    if ('erro' in u) return { dados: { erro: u.erro } }
    const unidades = await idsDasUnidades(c, u.unidade)
    const procurouEm = await ondeProcurou(c, unidades)
    if (!unidades.length) return { dados: { lancamentos: [] } }
    const situacao = args.situacao ?? 'em_aberto'
    const campoDaData = situacao === 'pagos' ? 'paid_at' : 'due_date'

    // Vencimento e pagamento pelo DIA da unidade (F62b), como a tela mostra.
    // O vencimento é gravado ao meio-dia de Brasília (vencimentoDoDia): o mesmo
    // dia em qualquer fuso do Brasil. O pagamento é um instante: o dia da unidade dele.
    const fuso = await fusoDe(c, u.unidade?.id ?? (unidades.length === 1 ? unidades[0] : null))
    const hoje = hojeNoFuso(fuso)
    const diaDe = (iso: string | null, tz: string = fuso) => (iso ? dayKeyTZ(iso, tz) : null)

    let q = c.admin.from('financial_transactions')
      .select('id, type, category, description, amount, payment_method, due_date, paid_at, is_paid, client_id, branch_id, parcela_numero, parcela_total, notes')
      .in('branch_id', unidades)
      // O mesmo da tela do financeiro: sem o saldo zerado que o check-in substitui.
      .or('is_paid.eq.true,amount.neq.0')
      .order(campoDaData, { ascending: situacao !== 'pagos', nullsFirst: false })
      .limit(50)
    // D1 da 21ª (princípio 3): o contra-lançamento do estorno (category 'Estorno')
    // é EXPENSE no banco, e "as despesas" o somavam — a tela o tira do resultado
    // (resultadoDaLista). Pedido o tipo, o estorno fica de fora.
    if (args.tipo) q = q.eq('type', args.tipo === 'receita' ? 'INCOME' : 'EXPENSE').or('category.is.null,category.neq.Estorno')
    if (situacao === 'em_aberto') q = q.eq('is_paid', false)
    if (situacao === 'vencidos') q = q.eq('is_paid', false).lt('due_date', janelaDoDia(hoje, fuso).inicio.toISOString())
    if (situacao === 'pagos') q = q.eq('is_paid', true)
    if (args.de) q = q.gte(campoDaData, janelaDoDia(args.de, fuso).inicio.toISOString())
    if (args.ate) q = q.lte(campoDaData, janelaDoDia(args.ate, fuso).fim.toISOString())
    if (args.cliente) q = q.eq('client_id', args.cliente)

    const linhas = (await ler(q, 'ler os lançamentos') as {
      id: string; type: string; category: string | null; description: string | null; amount: number; payment_method: string | null
      due_date: string | null; paid_at: string | null; is_paid: boolean; client_id: string | null; branch_id: string
      parcela_numero: number | null; parcela_total: number | null; notes: string | null
    }[] | null) ?? []
    const [clientes, nomesDasUnidades, fusos] = await Promise.all([
      nomesPorId(c, 'clients', linhas.map(l => l.client_id)),
      nomesPorId(c, 'branches', linhas.map(l => l.branch_id)),
      fusosPorUnidade(c, linhas.map(l => l.branch_id)),
    ])
    return {
      dados: {
        situacao, procurouEm, quantidade: linhas.length,
        lancamentos: linhas.map(l => ({
          id: l.id, tipo: l.category === 'Estorno' ? 'estorno' : l.type === 'INCOME' ? 'receita' : 'despesa',
          descricao: l.description ?? l.category, categoria: l.category, valor: dinheiro(l.amount),
          vencimento: diaDe(l.due_date), pagoEm: diaDe(l.paid_at, fusos.get(l.branch_id) ?? fuso),
          situacao: l.notes === 'Estornada' ? 'estornado'
            : l.is_paid ? 'pago'
            : (l.due_date && diaDe(l.due_date)! < hoje ? 'vencido' : 'em aberto'),
          forma: l.payment_method ? (FORMA[l.payment_method] ?? l.payment_method) : null,
          cliente: l.client_id ? (clientes.get(l.client_id) ?? null) : null,
          unidade: nomesDasUnidades.get(l.branch_id) ?? null,
          parcela: l.parcela_total && l.parcela_total > 1 ? `${l.parcela_numero}/${l.parcela_total}` : null,
        })),
        ...(linhas.length === 50 ? { aviso: 'Mostrando os 50 primeiros.' } : {}),
      },
    }
  },
}

/**
 * O saldo como a prateleira da tela o diz (C5 do levantamento, F66): o produto
 * com unidade de consumo pelo rendimento ("1 frasco fechado + 1 aberto com 50
 * UI"), não o `current_stock`, que conta a embalagem aberta inteira ("2
 * frasco"); a medida no plural.
 */
type MedidasLidas = { unit: string | null; consumption_unit: string | null; units_per_package: number | string | null; min_stock?: number | string | null }
function saldoDaPrateleira(l: { current_stock: number; current_rendimento: number | null }, p: MedidasLidas): string {
  const rende = p.consumption_unit && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : 0
  const un = p.unit ?? ''
  if (!rende) return saldoNaPrateleira(Number(l.current_stock), 0, un, '').trim()
  const rend = l.current_rendimento != null ? Number(l.current_rendimento) : Number(l.current_stock) * rende
  return saldoNaPrateleira(rend, rende, un, p.consumption_unit!)
}
/** O mínimo na mesma régua ("2 frascos (200 UI)"). */
function minimoNaRegua(minimo: number, p: MedidasLidas): string {
  const rende = p.consumption_unit && Number(p.units_per_package) > 0 ? Number(p.units_per_package) : 0
  const un = p.unit ?? ''
  // A15 da 14ª: o mínimo herdado do cadastro do produto diz "(do cadastro)", como a tela.
  const doCadastro = minimoEhDoCadastro(minimo, p.min_stock != null ? Number(p.min_stock) : null) ? ' (do cadastro)' : ''
  return `${formatarQuantidade(minimo)} ${medidaNoPlural(un, minimo)}${rende ? ` (${formatarQuantidade(minimo * rende)} ${p.consumption_unit})` : ''}`.trim() + doCadastro
}

export const estoque: FerramentaDeLeitura<{
  filtro?: 'abaixo_do_minimo' | 'zerados' | 'vencendo' | 'produto'; produto?: string; dias?: number; unidade?: string
}> = {
  nome: 'estoque',
  tipo: 'leitura',
  modulo: 'stock', nivel: 'VIEW',
  recurso: 'estoque',
  // A15 da 31ª: "Alginato de Itajaí" ia inteiro como nome do produto — a descrição ensina a separar.
  descricao: 'O estoque por unidade: "abaixo_do_minimo" (padrão), "zerados" (sem saldo na unidade, também o produto que nunca entrou nela), "vencendo" (lotes que vencem em N dias; padrão 30) ou "produto" (o saldo de um produto pelo nome em cada unidade, com 0 onde não há, e os lotes com saldo). Sem unidade, procura em todas as da pessoa: para "o produto X em cada unidade", passe só o produto. O nome da unidade vai separado do produto: "Alginato de Itajaí" é produto "Alginato" e unidade "Itajaí".',
  parametros: z.object({
    filtro: z.enum(['abaixo_do_minimo', 'zerados', 'vencendo', 'produto']).optional(),
    produto: z.string().max(80).optional(),
    dias: z.number().int().min(1).max(365).optional(),
    unidade: z.string().max(80).optional(),
  }),
  async executar(c, args) {
    // Sem unidade no pedido, em todas as da pessoa (D4 da 18ª).
    const u = await resolverUnidade(c, args.unidade, { paraLer: true })
    if ('erro' in u) return { dados: { erro: u.erro } }
    const unidades = await idsDasUnidades(c, u.unidade)
    const procurouEm = await ondeProcurou(c, unidades)
    if (!unidades.length) return { dados: { itens: [] } }
    const filtro = args.filtro ?? (args.produto ? 'produto' : 'abaixo_do_minimo')
    const nomesDasUnidades = await nomesPorId(c, 'branches', unidades)

    if (filtro === 'vencendo') {
      // A validade é um DIA, gravado à meia-noite UTC (D1 da 7ª): até o fim daquele dia.
      // "Daqui a N dias" a partir do dia da unidade (F62b); a validade é um dia.
      const fusoDoLote = await fusoDe(c, unidades.length === 1 ? unidades[0] : null)
      const ateODia = dayKeyTZ(addDaysTZ(new Date(), args.dias ?? 30, fusoDoLote), fusoDoLote)
      const ate = `${ateODia}T23:59:59.999Z`
      const lotes = (await ler(c.admin.from('product_batches')
        .select('batch_number, expires_at, quantity, branch_id, products!inner(name, unit, tenant_id)')
        .in('branch_id', unidades).eq('products.tenant_id', c.ctx.tenantId!)
        .gt('quantity', 0).lte('expires_at', ate).order('expires_at').limit(50), 'ler os lotes vencendo') as unknown as {
          batch_number: string | null; expires_at: string; quantity: number; branch_id: string; products: { name: string; unit: string | null }
        }[] | null) ?? []
      const fusosDosLotes = await fusosPorUnidade(c, lotes.map(l => l.branch_id))
      return {
        dados: {
          filtro, procurouEm, ateODia,
          lotes: lotes.map(l => ({
            produto: l.products.name, lote: l.batch_number, vence: l.expires_at.slice(0, 10),
            jaVenceu: loteVencido(l.expires_at, new Date(), fusosDosLotes.get(l.branch_id) ?? fusoDoLote),
            quantidade: `${formatarQuantidade(Number(l.quantity))} ${medidaNoPlural(l.products.unit ?? '', Number(l.quantity))}`.trim(), unidade: nomesDasUnidades.get(l.branch_id) ?? null,
          })),
        },
      }
    }

    if (filtro === 'abaixo_do_minimo') {
      // No banco (copilot_estoque_critico): saldo <= mínimo, a régua da tela.
      const criticos = (await ler(c.admin.rpc('copilot_estoque_critico', { p_tenant: c.ctx.tenantId!, p_branch_ids: unidades, p_limite: 60 }), 'ler o estoque crítico') as
        { product_id: string; name: string; unit: string | null; branch_id: string; current_stock: number; min_stock: number }[] | null) ?? []
      // O rendimento e as medidas de cada linha, para dizer o saldo como a tela.
      const ids = [...new Set(criticos.map(l => l.product_id))]
      const extras = ids.length ? ((await ler(c.admin.from('branch_product_stock')
        .select('product_id, branch_id, current_rendimento, products!inner(unit, consumption_unit, units_per_package, tenant_id, min_stock)')
        .in('product_id', ids).in('branch_id', unidades).eq('products.tenant_id', c.ctx.tenantId!), 'ler o rendimento do estoque crítico') as unknown as
        { product_id: string; branch_id: string; current_rendimento: number | null; products: MedidasLidas }[] | null) ?? []) : []
      const extra = new Map(extras.map(e => [`${e.product_id}:${e.branch_id}`, e]))
      return {
        dados: {
          filtro, procurouEm,
          itens: criticos.map(l => {
            const e = extra.get(`${l.product_id}:${l.branch_id}`)
            const medidas = e?.products ?? { unit: l.unit, consumption_unit: null, units_per_package: null }
            return {
              produto: l.name, produtoId: l.product_id, unidade: nomesDasUnidades.get(l.branch_id) ?? null,
              saldo: saldoDaPrateleira({ current_stock: l.current_stock, current_rendimento: e?.current_rendimento ?? null }, medidas),
              minimo: Number(l.min_stock), minimoNaTela: minimoNaRegua(Number(l.min_stock), medidas),
            }
          }),
        },
      }
    }

    if (filtro === 'zerados') {
      // D24 da 31ª (D10 da 6ª, atendimento.md): sem estoque na unidade é não ter
      // saldo positivo NELA — o produto ativo que nunca entrou lá também conta.
      // Só as linhas que existiam (`current_stock <= 0`) deixavam a unidade de fora.
      const produtos = await lerTodas<ProdutoLido>((de, ate) => c.admin.from('products')
        .select('id, name, unit, consumption_unit, units_per_package, min_stock')
        .eq('tenant_id', c.ctx.tenantId!).eq('is_active', true)
        .order('name').order('id').range(de, ate), 'ler os produtos ativos')
      const saldos = produtos.length ? await saldosDosProdutos(c, produtos.map(p => p.id), unidades) : new Map<string, SaldoLido>()
      const itens = produtos.flatMap(p => unidades.flatMap(u => {
        const s = saldos.get(`${p.id}:${u}`)
        const situacao = situacaoDoEstoque(
          { embalagens: Number(s?.current_stock ?? 0), rendimento: s?.current_rendimento != null ? Number(s.current_rendimento) : (s ? null : 0), minimo: Number(s?.min_stock ?? 0) },
          { unit: p.unit ?? '', consumption_unit: p.consumption_unit, units_per_package: p.units_per_package })
        return situacao === 'SEM_ESTOQUE' ? [itemDoSaldo(p, u, s, nomesDasUnidades)] : []
      }))
      return {
        dados: {
          filtro, procurouEm, quantidade: itens.length, itens: itens.slice(0, 60),
          ...(itens.length > 60 ? { aviso: `Mostrando 60 de ${itens.length}.` } : {}),
        },
      }
    }

    // filtro === 'produto': o saldo do produto em CADA unidade ao alcance (D24
    // da 31ª) — a unidade sem linha diz 0, como a janela do Ajuste — com os lotes
    // que têm saldo (CX-05: o Copilot fala como as janelas do Estoque).
    if (!args.produto) return { dados: { erro: 'Qual produto?' } }
    let pedido = { produto: args.produto, unidades, procurouEm }
    let produtos = await produtosPeloNome(c, pedido.produto)
    let entendido: { produto: string; unidade: string } | undefined
    if (!produtos.length && !args.unidade) {
      // A15 da 31ª: "Alginato de Itajaí" — sem produto com o nome inteiro e com
      // o nome de uma unidade no pedido, é o produto "Alginato" na unidade Itajaí.
      const separado = separarUnidadeDoProduto(args.produto, await unidadesDaRede(c))
      if (separado) {
        const u2 = await resolverUnidade(c, separado.unidade.id, { paraLer: true })
        if ('erro' in u2) return { dados: { erro: u2.erro } }
        const ids = await idsDasUnidades(c, u2.unidade)
        pedido = { produto: separado.produto, unidades: ids, procurouEm: await ondeProcurou(c, ids) }
        produtos = await produtosPeloNome(c, separado.produto)
        entendido = { produto: separado.produto, unidade: separado.unidade.name }
      }
    }
    if (!produtos.length) return { dados: { filtro, procurouEm: pedido.procurouEm, itens: [], erro: `Nenhum produto ativo com "${pedido.produto}" no nome.` } }
    const ids = produtos.map(p => p.id)
    const [saldos, lotes, nomes] = await Promise.all([
      saldosDosProdutos(c, ids, pedido.unidades),
      ler(c.admin.from('product_batches')
        .select('product_id, branch_id, batch_number, expires_at, quantity')
        .in('product_id', ids).in('branch_id', pedido.unidades).gt('quantity', 0)
        .order('expires_at', { ascending: true, nullsFirst: false }).limit(200), 'ler os lotes do produto') as Promise<{
          product_id: string; branch_id: string; batch_number: string | null; expires_at: string | null; quantity: number
        }[] | null>,
      nomesPorId(c, 'branches', pedido.unidades),
    ])
    const itens = produtos.flatMap(p => {
      // A unidade com o produto primeiro; a que não tem nada (0), depois.
      const ordem = [...pedido.unidades].sort((a, b) => Number(!saldos.has(`${p.id}:${a}`)) - Number(!saldos.has(`${p.id}:${b}`)))
      return ordem.map(u => ({
        ...itemDoSaldo(p, u, saldos.get(`${p.id}:${u}`), nomes),
        lotes: (lotes ?? []).filter(l => l.product_id === p.id && l.branch_id === u).map(l => ({
          lote: l.batch_number, vence: l.expires_at ? l.expires_at.slice(0, 10) : null,
          saldo: saldoDoLoteNaTela(Number(l.quantity), { unit: p.unit ?? '', consumption_unit: p.consumption_unit, units_per_package: p.units_per_package }),
        })),
      }))
    })
    return {
      dados: {
        filtro, procurouEm: pedido.procurouEm, ...(entendido ? { entendido } : {}),
        itens: itens.slice(0, 60), ...(itens.length > 60 ? { aviso: `Mostrando 60 de ${itens.length}.` } : {}),
      },
    }
  },
}

type ProdutoLido = { id: string; name: string } & MedidasLidas
type SaldoLido = { product_id: string; branch_id: string; current_stock: number; current_rendimento: number | null; min_stock: number | null }

/** Os produtos ATIVOS da rede com o texto no nome (até 20). */
async function produtosPeloNome(c: ContextoDaFerramenta, nome: string): Promise<ProdutoLido[]> {
  return (await ler(c.admin.from('products')
    .select('id, name, unit, consumption_unit, units_per_package, min_stock')
    .eq('tenant_id', c.ctx.tenantId!).eq('is_active', true)
    .ilike('name', `%${nome.replace(/[%_\\]/g, '').trim()}%`)
    .order('name').limit(20), 'ler os produtos pelo nome') as ProdutoLido[] | null) ?? []
}

/** Os saldos dos produtos nas unidades, por `produto:unidade` (a linha que não existe não está no mapa). */
async function saldosDosProdutos(c: ContextoDaFerramenta, produtos: string[], unidades: string[]): Promise<Map<string, SaldoLido>> {
  const linhas = await lerTodas<SaldoLido>((de, ate) => c.admin.from('branch_product_stock')
    .select('product_id, branch_id, current_stock, current_rendimento, min_stock')
    .in('product_id', produtos).in('branch_id', unidades)
    .order('product_id').order('branch_id').range(de, ate), 'ler os saldos do estoque')
  return new Map(linhas.map(l => [`${l.product_id}:${l.branch_id}`, l]))
}

/** Uma linha da resposta: o saldo da prateleira (0 sem linha na unidade) e o mínimo da unidade. */
function itemDoSaldo(p: ProdutoLido, unidade: string, s: SaldoLido | undefined, nomes: Map<string, string>) {
  const minimo = s?.min_stock != null ? Number(s.min_stock) : null
  return {
    produto: p.name, produtoId: p.id, unidade: nomes.get(unidade) ?? null,
    saldo: saldoDaPrateleira({ current_stock: Number(s?.current_stock ?? 0), current_rendimento: s ? s.current_rendimento : 0 }, p),
    minimo,
    ...(minimo != null && minimo > 0 ? { minimoNaTela: minimoNaRegua(minimo, p) } : {}),
    ...(s ? {} : { semEntradaNaUnidade: true }),
  }
}

const semAcento = (t: string) => t.normalize('NFC').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * "Alginato de Itajaí" → o produto "Alginato" e a unidade Itajaí (A15 da 31ª).
 * A unidade se reconhece pelo nome inteiro ou por uma palavra dele que só ela
 * tem (de 4 letras ou mais: "Itajaí" em "Lobélia Itajaí"), com o "de/da/do/em/
 * na/no" antes. Sem unidade no texto, ou sem sobrar produto, nulo.
 */
export function separarUnidadeDoProduto(texto: string, unidades: Unidade[]): { produto: string; unidade: Unidade } | null {
  const original = texto.normalize('NFC')
  const norm = semAcento(original)
  const palavras = (n: string) => semAcento(n).split(/[^\p{L}\p{N}]+/u).filter(p => p.length >= 4)
  for (const u of unidades) {
    const outras = unidades.filter(x => x.id !== u.id).flatMap(x => palavras(x.name))
    const chaves = [semAcento(u.name), ...palavras(u.name).filter(p => !outras.includes(p))]
    for (const chave of chaves) {
      const re = new RegExp(`(^|\\s)(?:(?:de|da|do|das|dos|em|na|no|nas|nos)\\s+)?${escapar(chave)}(?=$|[\\s,.;:!?])`, 'u')
      const m = re.exec(norm)
      if (!m) continue
      const inicio = m.index + m[1]!.length
      const produto = `${original.slice(0, inicio)} ${original.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim()
      if (produto) return { produto, unidade: u }
    }
  }
  return null
}

export const oportunidades: FerramentaDeLeitura<{ funil?: string; etapa?: string; busca?: string; incluirFechadas?: boolean }> = {
  nome: 'oportunidades',
  tipo: 'leitura',
  modulo: 'crm', nivel: 'VIEW',
  recurso: 'oportunidades',
  descricao: 'As oportunidades do funil comercial: nome, telefone, etapa, funil, valor, responsável e se já é cliente. Filtros: funil (nome), etapa (nome), busca (nome/telefone). Por padrão só as em aberto. Até 50.',
  parametros: z.object({
    funil: z.string().max(80).optional(), etapa: z.string().max(80).optional(),
    busca: z.string().max(80).optional(), incluirFechadas: z.boolean().optional(),
  }),
  async executar(c, args) {
    const tenant = c.ctx.tenantId!
    const [funis, etapas] = await Promise.all([
      ler(c.admin.from('crm_funnels').select('id, name, is_default').eq('tenant_id', tenant).is('archived_at', null), 'ler os funis') as Promise<{ id: string; name: string; is_default: boolean }[] | null>,
      ler(c.admin.from('crm_stages').select('id, name, funnel_id, outcome, position').eq('tenant_id', tenant).order('position'), 'ler as etapas') as Promise<{ id: string; name: string; funnel_id: string; outcome: string | null; position: number }[] | null>,
    ])
    const ativos = new Map((funis ?? []).map(f => [f.id, f]))
    let alvoEtapas = (etapas ?? []).filter(e => ativos.has(e.funnel_id))
    if (args.funil) {
      const f = [...ativos.values()].find(x => x.name.toLowerCase().includes(args.funil!.toLowerCase()))
      if (!f) return { dados: { erro: `Funil "${args.funil}" não encontrado. Funis: ${[...ativos.values()].map(x => x.name).join(', ')}.` } }
      alvoEtapas = alvoEtapas.filter(e => e.funnel_id === f.id)
    }
    if (args.etapa) {
      alvoEtapas = alvoEtapas.filter(e => e.name.toLowerCase().includes(args.etapa!.toLowerCase()))
      if (!alvoEtapas.length) return { dados: { erro: `Etapa "${args.etapa}" não encontrada.` } }
    }
    if (!args.incluirFechadas) alvoEtapas = alvoEtapas.filter(e => !e.outcome || e.outcome === 'OPEN')
    if (!alvoEtapas.length) return { dados: { oportunidades: [] } }

    let q = c.admin.from('leads').select('id, name, phone, value, owner_id, crm_stage_id, client_id, updated_at')
      .eq('tenant_id', tenant).in('crm_stage_id', alvoEtapas.map(e => e.id))
      .order('updated_at', { ascending: false }).limit(50)
    if (args.busca) {
      // Sem os caracteres que mexem no filtro do PostgREST (vírgula, parênteses, aspas).
      const t = args.busca.replace(/[%_\\,()"'.:]/g, '').trim()
      const digitos = t.replace(/\D/g, '')
      // Telefone pelos dígitos só quando o termo é um telefone (sem letra): a
      // regra da busca (docs/regras/busca.md) — "Maria 11" não acha todo 11.
      q = !/\p{L}/u.test(t) && digitos.length >= 8
        ? q.ilike('phone', `%${digitos.slice(-8)}%`)
        : q.ilike('name', `%${t}%`)
    }
    const linhas = (await ler(q, 'ler as oportunidades') as { id: string; name: string; phone: string | null; value: number | null; owner_id: string | null; crm_stage_id: string; client_id: string | null }[] | null) ?? []
    const donos = await nomesPorId(c, 'users', linhas.map(l => l.owner_id))
    const porEtapa = new Map(alvoEtapas.map(e => [e.id, e]))
    const itens = linhas.map(l => {
      const e = porEtapa.get(l.crm_stage_id)
      return {
        id: l.id, nome: l.name, telefone: l.phone, valor: l.value != null ? dinheiro(l.value) : null,
        etapa: e?.name ?? null, funil: e ? ativos.get(e.funnel_id)?.name ?? null : null,
        responsavel: l.owner_id ? (donos.get(l.owner_id) ?? null) : 'sem responsável',
        // O filtro "Já é cliente / Ainda não é cliente" do quadro.
        jaECliente: !!l.client_id,
        href: rotaOportunidade(c.pagina, c.slugDoPortal, l.id, e?.funnel_id),
      }
    })
    return {
      dados: { quantidade: itens.length, oportunidades: itens },
      cartao: itens.length ? { tipo: 'links', itens: itens.slice(0, 12).map(i => ({ texto: i.nome, detalhe: [i.etapa, i.valor].filter(Boolean).join(' · ') || undefined, href: i.href })) } : undefined,
    }
  },
}
