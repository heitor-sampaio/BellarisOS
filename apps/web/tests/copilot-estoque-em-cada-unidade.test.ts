import { describe, it, expect, vi } from 'vitest'
import type { TenantContext, ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

vi.setConfig({ testTimeout: 30_000 })

/**
 * A consulta de estoque do Copilot cobre as unidades ao alcance (CW-04; o
 * Estoque conta o produto sem linha na unidade como sem estoque — D10 da 6ª,
 * atendimento.md; CX-05: "o estoque no Copilot fala como as janelas do
 * Estoque").
 *
 * D24 da 31ª: o Valmir ("A rede inteira") pediu o saldo de um produto "em cada
 * unidade", e o Copilot listou só Blumenau — sem Itajaí (0) e sem lote. A
 * leitura só devolvia as linhas de `branch_product_stock` que existiam: a
 * unidade em que o produto nunca entrou sumia da resposta.
 *
 * A15 da 31ª (princípio 7): "Alginato de Itajaí" foi lido como o NOME do
 * produto, três vezes. Sem produto com esse nome e com o nome de uma unidade
 * no pedido, a ferramenta separa: o produto "Alginato" na unidade Itajaí.
 * Decisões do Claude, 26/11.
 */

const UNIDADES = [
  { id: 'b-blu', name: 'Lobélia Blumenau' },
  { id: 'b-ita', name: 'Lobélia Itajaí' },
]
vi.mock('@/lib/cached-queries', () => ({
  getCachedNetworkBranches: async () => UNIDADES,
  filtroDeQuemAtendeNaUnidade: (id: string) => `atende_em.cs.{${id}}`,
}))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
}))

const ALGINATO = { id: 'p-alg', name: 'Alginato', unit: 'pote', consumption_unit: 'g', units_per_package: 1000, min_stock: 1, is_active: true, tenant_id: 't1' }
const AGUA = { id: 'p-agua', name: 'Água micelar', unit: 'frasco', consumption_unit: null, units_per_package: null, min_stock: null, is_active: true, tenant_id: 't1' }
const PRODUTOS = [ALGINATO, AGUA]
const SALDOS = [
  { product_id: 'p-alg', branch_id: 'b-blu', current_stock: 2, current_rendimento: 1910, min_stock: 1 },
  { product_id: 'p-agua', branch_id: 'b-ita', current_stock: 3, current_rendimento: null, min_stock: 0 },
]
const LOTES = [
  { product_id: 'p-alg', branch_id: 'b-blu', batch_number: 'A1', expires_at: '2027-05-01T00:00:00.000Z', quantity: 1.91 },
]

const TODAS = FUNCIONALIDADES.map(f => f.chave)
function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'auth', internalUserId: 'u1', userName: 'Valmir', roleLabel: 'Estoque',
    tenantId: 't1', branchId: null, unidades: null, role: 'BRANCH_ADMIN', roleId: 'r1', clientId: null,
    permissions: { ...NO_PERMISSIONS, copilot: 'VIEW', stock: 'MANAGE' } as ResolvedPermissions,
    reportTabs: [], providesServices: false, isNetworkAdmin: false, isClient: false,
    plano: { funcionalidades: TODAS, limites: { unidades: null, membros: null, whatsapp: null } },
    ...over,
  } as TenantContext
}

/** Um Supabase falso que aplica os filtros `.in`, `.eq` e `.ilike` às tabelas acima. */
function adminFalso() {
  const pedidos: { tabela: string; filtros: [string, string, unknown][] }[] = []
  const tabelas: Record<string, Record<string, unknown>[]> = {
    branches: UNIDADES,
    products: PRODUTOS,
    branch_product_stock: SALDOS.map(s => ({ ...s, products: PRODUTOS.find(p => p.id === s.product_id) })),
    product_batches: LOTES.map(l => ({ ...l, products: PRODUTOS.find(p => p.id === l.product_id) })),
  }
  const campo = (linha: Record<string, unknown>, coluna: string): unknown =>
    coluna.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], linha)
  const casa = (linha: Record<string, unknown>, [op, coluna, valor]: [string, string, unknown]) => {
    const v = campo(linha, coluna)
    if (op === 'in') return (valor as unknown[]).includes(v)
    if (op === 'eq') return v === valor
    if (op === 'gt') return Number(v) > Number(valor)
    if (op === 'ilike') {
      const re = new RegExp(`^${String(valor).split('%').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i')
      return re.test(String(v ?? ''))
    }
    return true
  }
  const admin = {
    from(tabela: string) {
      const pedido = { tabela, filtros: [] as [string, string, unknown][] }
      pedidos.push(pedido)
      const encadeia: Record<string, unknown> = new Proxy({}, {
        get(_, prop: string) {
          if (prop === 'then') {
            return (ok: (v: unknown) => void) => ok({ data: (tabelas[tabela] ?? []).filter(l => pedido.filtros.every(f => casa(l, f))), error: null })
          }
          if (['in', 'eq', 'gt', 'ilike'].includes(prop)) return (coluna: string, valor: unknown) => { pedido.filtros.push([prop, coluna, valor]); return encadeia }
          return () => encadeia
        },
      })
      return encadeia
    },
    rpc: async () => ({ data: [], error: null }),
  }
  return { admin, pedidos }
}

function contexto(c: TenantContext) {
  const { admin, pedidos } = adminFalso()
  return { c: { ctx: c, admin: admin as never, pagina: '/admin/estoque', slugDoPortal: null }, pedidos }
}

type Item = { produto: string; unidade: string | null; saldo: string; lotes?: { lote: string | null }[] }

describe('D24: o saldo de um produto vem em CADA unidade ao alcance, com 0 onde não há, e os lotes', () => {
  it('"Alginato" na rede inteira: Blumenau com o saldo e o lote, Itajaí com 0', async () => {
    const { estoque } = await import('@/lib/copilot/ferramentas/gestao')
    const { c } = contexto(ctx())
    const r = await estoque.executar(c, { filtro: 'produto', produto: 'Alginato' })
    const itens = (r.dados as { itens: Item[] }).itens
    expect(itens.map(i => i.unidade)).toEqual(['Lobélia Blumenau', 'Lobélia Itajaí'])
    expect(itens[0]!.saldo).toBe('1 pote fechado + 1 aberto com 910 g')
    expect(itens[0]!.lotes?.map(l => l.lote)).toEqual(['A1'])
    expect(itens[1]!.saldo).toMatch(/^0 /)
    expect((r.dados as { procurouEm: string }).procurouEm).toMatch(/Blumenau[\s\S]*Itajaí/)
  })

  it('"zerados": a unidade em que o produto nunca entrou também é sem estoque', async () => {
    const { estoque } = await import('@/lib/copilot/ferramentas/gestao')
    const { c } = contexto(ctx())
    const r = await estoque.executar(c, { filtro: 'zerados' })
    const itens = (r.dados as { itens: Item[] }).itens
    expect(itens.map(i => `${i.produto} · ${i.unidade}`).sort()).toEqual(['Alginato · Lobélia Itajaí', 'Água micelar · Lobélia Blumenau'])
  })
})

describe('A15: "Alginato de Itajaí" é o produto Alginato na unidade Itajaí', () => {
  it('sem produto com o nome inteiro, separa a unidade do produto', async () => {
    const { estoque } = await import('@/lib/copilot/ferramentas/gestao')
    const { c } = contexto(ctx())
    const r = await estoque.executar(c, { filtro: 'produto', produto: 'Alginato de Itajaí' })
    const d = r.dados as { itens: Item[]; procurouEm: string }
    expect(d.itens.map(i => [i.produto, i.unidade])).toEqual([['Alginato', 'Lobélia Itajaí']])
    expect(d.procurouEm).toBe('Lobélia Itajaí')
  })

  it('a descrição da ferramenta ensina a separar, em português', async () => {
    const { estoque } = await import('@/lib/copilot/ferramentas/gestao')
    expect(estoque.descricao).toMatch(/cada unidade/i)
    expect(estoque.descricao).toMatch(/unidade[^.]*separad|separ[^.]*unidade/i)
  })
})

describe('A15: o prompt não deixa nome de ferramenta, parâmetro ou valor dele na resposta', () => {
  it('a regra está no prompt', async () => {
    const { instrucoesDoCopilot } = await import('@/lib/copilot/prompt')
    const texto = instrucoesDoCopilot(ctx(), { rede: 'Lobélia', unidade: null, unidades: ['Lobélia Blumenau', 'Lobélia Itajaí'], pagina: '/admin/estoque', slugDoPortal: null, fuso: 'America/Sao_Paulo' })
    expect(texto).toMatch(/nunca escreva o nome de uma ferramenta, de um parâmetro/i)
  })
})
