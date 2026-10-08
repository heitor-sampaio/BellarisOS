import 'server-only'
import { z } from 'zod/v4'
import { isOwnScope, ownerFilter } from '@/lib/auth'
import { ler } from '@/lib/db'
import { addDaysTZ } from '@/lib/datetime'
import { rotaOportunidade } from '@/lib/rotas'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { DATA, UUID, dinheiro, idsDasUnidades, janelaDoDia, nomesPorId, resolverUnidade } from '@/lib/copilot/ferramentas/comum'

/**
 * As leituras de FINANCEIRO, ESTOQUE e OPORTUNIDADES.
 *
 * Lista, não soma: total de dinheiro é indicador (`indicadores`, que vem de
 * lib/metrics, §13.1) — somar aqui seria uma regra própria de receita.
 */

const FORMA: Record<string, string> = { CASH: 'dinheiro', PIX: 'Pix', DEBIT_CARD: 'débito', CREDIT_CARD: 'crédito', INTERNAL_CREDIT: 'crédito interno' }

export const lancamentos: FerramentaDeLeitura<{
  tipo?: 'receita' | 'despesa'; situacao?: 'em_aberto' | 'vencidos' | 'pagos' | 'todos'; de?: string; ate?: string; unidade?: string; cliente?: string
}> = {
  nome: 'lancamentos',
  tipo: 'leitura',
  modulo: 'financial', nivel: 'VIEW',
  // "Só as próprias comissões" não é financeiro da clínica: a tela também não mostra.
  pode: ctx => !isOwnScope(ctx, 'financial'),
  descricao: 'Lançamentos financeiros (contas a receber e a pagar): em aberto (padrão), vencidos, pagos ou todos; receita ou despesa; por período (vencimento, ou pagamento quando "pagos"), unidade ou cliente (id). Até 50. Para TOTAIS do período use a ferramenta indicadores.',
  parametros: z.object({
    tipo: z.enum(['receita', 'despesa']).optional(),
    situacao: z.enum(['em_aberto', 'vencidos', 'pagos', 'todos']).optional(),
    de: DATA.optional(), ate: DATA.optional(),
    unidade: z.string().max(80).optional(),
    cliente: UUID.optional(),
  }),
  async executar(c, args) {
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    const unidades = await idsDasUnidades(c, u.unidade)
    if (!unidades.length) return { dados: { lancamentos: [] } }
    const situacao = args.situacao ?? 'em_aberto'
    const campoDaData = situacao === 'pagos' ? 'paid_at' : 'due_date'

    let q = c.admin.from('financial_transactions')
      .select('id, type, category, description, amount, payment_method, due_date, paid_at, is_paid, client_id, branch_id, parcela_numero, parcela_total')
      .in('branch_id', unidades)
      .order(campoDaData, { ascending: situacao !== 'pagos', nullsFirst: false })
      .limit(50)
    if (args.tipo) q = q.eq('type', args.tipo === 'receita' ? 'INCOME' : 'EXPENSE')
    if (situacao === 'em_aberto') q = q.eq('is_paid', false)
    if (situacao === 'vencidos') q = q.eq('is_paid', false).lt('due_date', new Date().toISOString())
    if (situacao === 'pagos') q = q.eq('is_paid', true)
    if (args.de) q = q.gte(campoDaData, janelaDoDia(args.de).inicio.toISOString())
    if (args.ate) q = q.lte(campoDaData, janelaDoDia(args.ate).fim.toISOString())
    if (args.cliente) q = q.eq('client_id', args.cliente)

    const linhas = (await ler(q, 'ler os lançamentos') as {
      id: string; type: string; category: string | null; description: string | null; amount: number; payment_method: string | null
      due_date: string | null; paid_at: string | null; is_paid: boolean; client_id: string | null; branch_id: string
      parcela_numero: number | null; parcela_total: number | null
    }[] | null) ?? []
    const [clientes, filiais] = await Promise.all([
      nomesPorId(c, 'clients', linhas.map(l => l.client_id)),
      nomesPorId(c, 'branches', linhas.map(l => l.branch_id)),
    ])
    const agora = Date.now()
    return {
      dados: {
        situacao, quantidade: linhas.length,
        lancamentos: linhas.map(l => ({
          id: l.id, tipo: l.type === 'INCOME' ? 'receita' : 'despesa',
          descricao: l.description ?? l.category, categoria: l.category, valor: dinheiro(l.amount),
          vencimento: l.due_date?.slice(0, 10) ?? null, pagoEm: l.paid_at?.slice(0, 10) ?? null,
          situacao: l.is_paid ? 'pago' : (l.due_date && new Date(l.due_date).getTime() < agora ? 'vencido' : 'em aberto'),
          forma: l.payment_method ? (FORMA[l.payment_method] ?? l.payment_method) : null,
          cliente: l.client_id ? (clientes.get(l.client_id) ?? null) : null,
          unidade: filiais.get(l.branch_id) ?? null,
          parcela: l.parcela_total && l.parcela_total > 1 ? `${l.parcela_numero}/${l.parcela_total}` : null,
        })),
        ...(linhas.length === 50 ? { aviso: 'Mostrando os 50 primeiros.' } : {}),
      },
    }
  },
}

export const estoque: FerramentaDeLeitura<{
  filtro?: 'abaixo_do_minimo' | 'zerados' | 'vencendo' | 'produto'; produto?: string; dias?: number; unidade?: string
}> = {
  nome: 'estoque',
  tipo: 'leitura',
  modulo: 'stock', nivel: 'VIEW',
  recurso: 'estoque',
  descricao: 'O estoque por unidade: "abaixo_do_minimo" (padrão), "zerados", "vencendo" (lotes que vencem em N dias; padrão 30) ou "produto" (o saldo de um produto pelo nome).',
  parametros: z.object({
    filtro: z.enum(['abaixo_do_minimo', 'zerados', 'vencendo', 'produto']).optional(),
    produto: z.string().max(80).optional(),
    dias: z.number().int().min(1).max(365).optional(),
    unidade: z.string().max(80).optional(),
  }),
  async executar(c, args) {
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    const unidades = await idsDasUnidades(c, u.unidade)
    if (!unidades.length) return { dados: { itens: [] } }
    const filtro = args.filtro ?? (args.produto ? 'produto' : 'abaixo_do_minimo')
    const filiais = await nomesPorId(c, 'branches', unidades)

    if (filtro === 'vencendo') {
      const ate = addDaysTZ(new Date(), args.dias ?? 30).toISOString()
      const lotes = (await ler(c.admin.from('product_batches')
        .select('batch_number, expires_at, quantity, branch_id, products!inner(name, unit, tenant_id)')
        .in('branch_id', unidades).eq('products.tenant_id', c.ctx.tenantId!)
        .gt('quantity', 0).lte('expires_at', ate).order('expires_at').limit(50), 'ler os lotes vencendo') as unknown as {
          batch_number: string | null; expires_at: string; quantity: number; branch_id: string; products: { name: string; unit: string | null }
        }[] | null) ?? []
      return {
        dados: {
          filtro, ateODia: ate.slice(0, 10),
          lotes: lotes.map(l => ({ produto: l.products.name, lote: l.batch_number, vence: l.expires_at.slice(0, 10), quantidade: `${Number(l.quantity)} ${l.products.unit ?? ''}`.trim(), unidade: filiais.get(l.branch_id) ?? null })),
        },
      }
    }

    let q = c.admin.from('branch_product_stock')
      .select('current_stock, min_stock, branch_id, products!inner(id, name, unit, tenant_id, is_active)')
      .in('branch_id', unidades).eq('products.tenant_id', c.ctx.tenantId!).eq('products.is_active', true)
      .limit(300)
    if (filtro === 'produto') {
      if (!args.produto) return { dados: { erro: 'Qual produto?' } }
      q = q.ilike('products.name', `%${args.produto.replace(/[%_\\]/g, '')}%`)
    }
    if (filtro === 'zerados') q = q.lte('current_stock', 0)
    const linhas = (await ler(q, 'ler o estoque') as unknown as {
      current_stock: number; min_stock: number | null; branch_id: string; products: { id: string; name: string; unit: string | null }
    }[] | null) ?? []
    const filtradas = filtro === 'abaixo_do_minimo'
      ? linhas.filter(l => Number(l.min_stock ?? 0) > 0 && Number(l.current_stock) < Number(l.min_stock))
      : linhas
    return {
      dados: {
        filtro,
        itens: filtradas.slice(0, 60).map(l => ({
          produto: l.products.name, produtoId: l.products.id, unidade: filiais.get(l.branch_id) ?? null,
          saldo: `${Number(l.current_stock)} ${l.products.unit ?? ''}`.trim(), minimo: l.min_stock != null ? Number(l.min_stock) : null,
        })),
      },
    }
  },
}

export const oportunidades: FerramentaDeLeitura<{ funil?: string; etapa?: string; busca?: string; incluirFechadas?: boolean }> = {
  nome: 'oportunidades',
  tipo: 'leitura',
  modulo: 'crm', nivel: 'VIEW',
  recurso: 'oportunidades',
  descricao: 'As oportunidades do funil comercial: nome, telefone, etapa, funil, valor e responsável. Filtros: funil (nome), etapa (nome), busca (nome/telefone). Por padrão só as em aberto. Até 50.',
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

    let q = c.admin.from('leads').select('id, name, phone, value, owner_id, crm_stage_id, updated_at')
      .eq('tenant_id', tenant).in('crm_stage_id', alvoEtapas.map(e => e.id))
      .order('updated_at', { ascending: false }).limit(50)
    // "Só os meus" do CRM: as suas e as sem dono (a regra do quadro, leadAoAlcance).
    const dono = ownerFilter(c.ctx, 'crm')
    if (dono) q = q.or(`owner_id.is.null,owner_id.eq.${dono}`)
    if (args.busca) {
      const t = args.busca.replace(/[%_\\,()]/g, '')
      q = q.or(`name.ilike.%${t}%,phone.ilike.%${t.replace(/\D/g, '') || t}%`)
    }
    const linhas = (await ler(q, 'ler as oportunidades') as { id: string; name: string; phone: string | null; value: number | null; owner_id: string | null; crm_stage_id: string }[] | null) ?? []
    const donos = await nomesPorId(c, 'users', linhas.map(l => l.owner_id))
    const porEtapa = new Map(alvoEtapas.map(e => [e.id, e]))
    const itens = linhas.map(l => {
      const e = porEtapa.get(l.crm_stage_id)
      return {
        id: l.id, nome: l.name, telefone: l.phone, valor: l.value != null ? dinheiro(l.value) : null,
        etapa: e?.name ?? null, funil: e ? ativos.get(e.funnel_id)?.name ?? null : null,
        responsavel: l.owner_id ? (donos.get(l.owner_id) ?? null) : 'sem responsável',
        href: rotaOportunidade(c.pagina, c.slugDoPortal, l.id, e?.funnel_id),
      }
    })
    return {
      dados: { quantidade: itens.length, oportunidades: itens },
      cartao: itens.length ? { tipo: 'links', itens: itens.slice(0, 12).map(i => ({ texto: i.nome, detalhe: [i.etapa, i.valor].filter(Boolean).join(' · ') || undefined, href: i.href })) } : undefined,
    }
  },
}
