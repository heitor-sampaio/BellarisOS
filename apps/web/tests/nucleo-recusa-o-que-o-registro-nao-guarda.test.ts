import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// O primeiro import() de um núcleo carrega o Supabase.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O que o REGISTRO não guarda se recusa no SERVIDOR, em português — nos núcleos
 * que a tela e o Copilot dividem (o Heitor, 25/11: "Se não for impossível,
 * ainda que improvável, pode ser feito."; CLAUDE.md §4, o Heitor, 19/11:
 * "Qualquer gravação que não passa pela validação do backend ta errada").
 *
 * Até aqui só o Copilot conferia: a tela mandava ao banco e ouvia de volta
 * "numeric field overflow", em inglês; e o custo negativo da entrada só o
 * `min="0"` do campo barrava.
 *
 * O impossível (decisão do Claude, 25/11) é o tipo da coluna:
 * `financial_transactions.amount` e `products.cost_price` são numeric(10,2)
 * (até 99.999.999,99); `leads.value` é numeric(12,2) (até 9.999.999.999,99);
 * a quantidade e o saldo do movimento (`stock_movements.quantity` e
 * `balance_after`) e do lote (`product_batches.quantity`,
 * `stock_movement_batches.quantity`) são numeric(10,4) — até 999.999,9999 na
 * unidade do MOVIMENTO (a de consumo quando o produto tem uma), para mais e
 * para menos (o saldo da baixa fica negativo quando falta).
 */

// Os núcleos recebem o cliente do banco; o que abrisse um próprio aqui já teria passado da recusa.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('o banco não devia ser chamado') } }))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/auth', async orig => ({ ...(await orig<typeof import('@/lib/auth')>()), alcancaUnidade: () => true }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
  fusoDoRecorte: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/financeiro/vezes-da-rede', () => ({ maquininhasDaRede: async () => [], recusaDasVezesDaRede: async () => null }))

const INGLES = /numeric|overflow|number|must|expected|too (big|small)|invalid|greater|less/i

/**
 * Um cliente do banco falso: cada tabela devolve as linhas do cenário, com o
 * `.eq` aplicado nos campos que a linha tem. Guarda o que se tentou gravar.
 */
function bancoFalso(tabelas: Record<string, Record<string, unknown>[]>) {
  const gravacoes: { tabela: string; op: string; dados?: unknown }[] = []
  const from = (tabela: string) => {
    const filtros: [string, unknown][] = []
    let unico = false
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'ilike', 'is', 'order', 'limit', 'neq', 'or', 'not']) b[op] = () => b
    b.eq = (campo: string, valor: unknown) => { filtros.push([campo, valor]); return b }
    b.in = (campo: string, valores: unknown[]) => { filtros.push([campo, { em: valores }]); return b }
    b.single = () => { unico = true; return b }
    b.maybeSingle = () => { unico = true; return b }
    for (const op of ['insert', 'update', 'upsert', 'delete']) b[op] = (dados?: unknown) => { gravacoes.push({ tabela, op, dados }); return b }
    b.then = (ok: (r: unknown) => unknown) => {
      const linhas = (tabelas[tabela] ?? []).filter(l => filtros.every(([c, v]) => !(c in l) || (v && typeof v === 'object' && 'em' in v ? (v as { em: unknown[] }).em.includes(l[c]) : l[c] === v)))
      return Promise.resolve({ data: unico ? linhas[0] ?? null : linhas, error: null }).then(ok)
    }
    return b
  }
  const rpc = (nome: string, dados: unknown) => { gravacoes.push({ tabela: nome, op: 'rpc', dados }); return Promise.resolve({ data: 0, error: null }) }
  return { admin: { from, rpc } as never, gravacoes }
}

const ctx = { tenantId: 't1', branchId: null, unidades: null, internalUserId: 'u1', userName: 'Bia', isNetworkAdmin: true, permissions: {} } as never

/** O frasco de toxina: 100 UI por frasco (o movimento é em UI). */
const TOXINA = { id: 'p-tox', tenant_id: 't1', name: 'Toxina', unit: 'frasco', consumption_unit: 'UI', units_per_package: 100, cost_price: 100 }
const LUVA = { id: 'p-luva', tenant_id: 't1', name: 'Luva', unit: 'cx', consumption_unit: null, units_per_package: null, cost_price: null }
const UNIDADES = [{ id: 'b1', tenant_id: 't1', is_active: true }, { id: 'b2', tenant_id: 't1', is_active: true }]

describe('o limite do registro (puro, um lugar só)', () => {
  it('o dinheiro do lançamento e do custo: numeric(10,2), conferido nos centavos', async () => {
    const m = await import('@/lib/financeiro/limites-do-registro') as Record<string, unknown>
    const recusa = m.recusaDoDinheiroAcimaDoRegistro as (v: number) => string | null
    expect(m.LIMITE_DO_DINHEIRO).toBe(99_999_999.99)
    expect(recusa(99_999_999.99)).toBeNull()
    expect(recusa(99_999_999.994)).toBeNull()
    expect(recusa(99_999_999.995)).toBe('No máximo 99.999.999,99 reais (o limite do registro).')
    expect(recusa(100_000_000)).toBe('No máximo 99.999.999,99 reais (o limite do registro).')
  })
  it('o custo unitário da entrada: o negativo é impossível, o zero vale, e o registro', async () => {
    const m = await import('@/lib/estoque/limites-do-registro') as Record<string, unknown>
    const recusa = m.recusaDoCustoDaEntrada as (v: number | null | undefined) => string | null
    expect(recusa(null)).toBeNull()
    expect(recusa(0)).toBeNull()
    expect(recusa(99_999_999.99)).toBeNull()
    expect(recusa(-0.01)).toBe('O custo unitário não pode ser negativo.')
    expect(recusa(100_000_000)).toContain('o limite do registro')
  })
  it('a quantidade e o saldo do estoque moram no estoque; o Copilot lê os mesmos', async () => {
    const estoque = await import('@/lib/estoque/limites-do-registro') as Record<string, unknown>
    const financeiro = await import('@/lib/financeiro/limites-do-registro') as Record<string, unknown>
    const copilot = await import('@/lib/copilot/ferramentas/limites-do-registro') as Record<string, unknown>
    expect(estoque.LIMITE_DO_ESTOQUE).toBe(999_999.9999)
    expect(copilot.LIMITE_DO_ESTOQUE).toBe(estoque.LIMITE_DO_ESTOQUE)
    expect(copilot.recusaDoEstoqueAcimaDoRegistro).toBe(estoque.recusaDoEstoqueAcimaDoRegistro)
    expect(copilot.RECUSA_DA_QUANTIDADE_DO_ESTOQUE).toBe(estoque.RECUSA_DA_QUANTIDADE_DO_ESTOQUE)
    expect(copilot.LIMITE_DO_DINHEIRO).toBe(financeiro.LIMITE_DO_DINHEIRO)
    expect(copilot.RECUSA_DO_DINHEIRO).toBe(financeiro.RECUSA_DO_DINHEIRO)
  })
  it('a baixa que falta: o saldo negativo também tem o limite do registro', async () => {
    const m = await import('@/lib/estoque/limites-do-registro') as Record<string, unknown>
    const recusa = m.recusaDaBaixaAcimaDoRegistro as (a: { quantidade: number; saldoDepois: number; medida: string }) => string | null
    expect(recusa({ quantidade: 10, saldoDepois: -999_999.9999, medida: 'UI' })).toBeNull()
    expect(recusa({ quantidade: 1_000_000, saldoDepois: 0, medida: 'UI' })).toBe('No máximo 999.999,9999 UI de uma vez (o limite do registro).')
    expect(recusa({ quantidade: 10, saldoDepois: -1_000_000, medida: 'UI' })).toBe('O saldo passaria de −999.999,9999 UI (o limite do registro).')
  })
  it('o valor estimado da oportunidade: numeric(12,2), na janela (lerValorEstimado)', async () => {
    const { lerValorEstimado, LIMITE_DO_VALOR_DA_OPORTUNIDADE } = await import('@/lib/crm/valor-do-card') as unknown as {
      lerValorEstimado: (t: string) => { valor: number | null } | { error: string }; LIMITE_DO_VALOR_DA_OPORTUNIDADE: number
    }
    expect(LIMITE_DO_VALOR_DA_OPORTUNIDADE).toBe(9_999_999_999.99)
    expect(lerValorEstimado('9.999.999.999,99')).toEqual({ valor: 9_999_999_999.99 })
    expect(lerValorEstimado('10.000.000.000,00')).toEqual({ error: 'No máximo 9.999.999.999,99 reais (o limite do registro).' })
    const copilot = await import('@/lib/copilot/ferramentas/limites-do-registro') as Record<string, unknown>
    expect(copilot.LIMITE_DO_VALOR_DA_OPORTUNIDADE).toBe(LIMITE_DO_VALOR_DA_OPORTUNIDADE)
  })
})

describe('lancarCore: o valor que o registro não guarda volta em português, sem tentar gravar', () => {
  it('acima de R$ 99.999.999,99 recusa; no limite, grava', async () => {
    const { lancarCore } = await import('@/lib/financeiro/lancamento')
    const base = { branchId: 'b1', tipo: 'EXPENSE' as const, categoria: 'Outro', descricao: 'Reforma', pago: false, vencimento: '2026-12-01' }
    const acima = bancoFalso({ branches: UNIDADES })
    const r = await lancarCore(acima.admin, ctx, { ...base, valor: 100_000_000 })
    expect(r).toEqual({ error: 'No máximo 99.999.999,99 reais (o limite do registro).' })
    expect(acima.gravacoes).toEqual([])
    const cabe = bancoFalso({ branches: UNIDADES, financial_transactions: [{ id: 'tx-1' }] })
    expect(await lancarCore(cabe.admin, ctx, { ...base, valor: 99_999_999.99 })).toEqual({ id: 'tx-1' })
  })
  it('a action do Novo lançamento confere cada lançamento que grava: o único, cada parcela e cada repetição', () => {
    const fonte = readFileSync(path.resolve(__dirname, '../actions/financial.ts'), 'utf8')
    expect(fonte).toContain('recusaDoDinheiroAcimaDoRegistro(')
  })
})

describe('entradaDeEstoqueCore: o custo negativo e o que o registro não guarda, no servidor', () => {
  const entrada = (extra: Record<string, unknown>) => ({ productId: 'p-tox', branchId: 'b1', quantidade: 1, ...extra })
  it('o custo negativo é recusado (o min="0" da tela não é a trava)', async () => {
    const { entradaDeEstoqueCore } = await import('@/lib/estoque/movimentos')
    const b = bancoFalso({ products: [TOXINA], branches: UNIDADES, branch_product_stock: [] })
    expect(await entradaDeEstoqueCore(b.admin, ctx, entrada({ custoUnitario: -5 }))).toEqual({ error: 'O custo unitário não pode ser negativo.' })
    expect(b.gravacoes).toEqual([])
  })
  it('o custo acima do registro é recusado em português', async () => {
    const { entradaDeEstoqueCore } = await import('@/lib/estoque/movimentos')
    const b = bancoFalso({ products: [TOXINA], branches: UNIDADES, branch_product_stock: [] })
    const r = await entradaDeEstoqueCore(b.admin, ctx, entrada({ custoUnitario: 100_000_000 })) as { error: string }
    expect(r.error).toContain('o limite do registro')
    expect(r.error).not.toMatch(INGLES)
    expect(b.gravacoes).toEqual([])
  })
  it('a quantidade na unidade do movimento (10.000 frascos = 1.000.000 UI) e o saldo depois', async () => {
    const { entradaDeEstoqueCore } = await import('@/lib/estoque/movimentos')
    const b = bancoFalso({ products: [TOXINA], branches: UNIDADES, branch_product_stock: [{ product_id: 'p-tox', branch_id: 'b1', current_stock: 9_990, current_rendimento: 999_000 }] })
    const muitos = await entradaDeEstoqueCore(b.admin, ctx, entrada({ quantidade: 10_000 })) as { error: string }
    expect(muitos.error).toBe('No máximo 9.999,9999 frascos de uma vez (999.999,9999 UI, o limite do registro).')
    const saldo = await entradaDeEstoqueCore(b.admin, ctx, entrada({ quantidade: 20 })) as { error: string }
    expect(saldo.error).toBe('O saldo passaria de 999.999,9999 UI (o limite do registro).')
    expect(b.gravacoes).toEqual([])
    const cabe = await entradaDeEstoqueCore(b.admin, ctx, entrada({ quantidade: 5, custoUnitario: 0 }))
    expect(cabe).toHaveProperty('ok', true)
    expect(b.gravacoes.map(g => g.tabela)).toEqual(['estoque_entrada'])
  })
  it('sem unidade de consumo, a embalagem é a régua', async () => {
    const { entradaDeEstoqueCore } = await import('@/lib/estoque/movimentos')
    const b = bancoFalso({ products: [LUVA], branches: UNIDADES, branch_product_stock: [] })
    const r = await entradaDeEstoqueCore(b.admin, ctx, { productId: 'p-luva', branchId: 'b1', quantidade: 1_000_000 }) as { error: string }
    expect(r.error).toBe('No máximo 999.999,9999 cx (o limite do registro).')
  })
})

describe('ajusteDeEstoqueCore: a contagem que o registro não guarda', () => {
  it('em embalagens vale na UI; na unidade de consumo, ela mesma', async () => {
    const { ajusteDeEstoqueCore } = await import('@/lib/estoque/movimentos')
    const b = bancoFalso({ products: [TOXINA], branches: UNIDADES, branch_product_stock: [{ product_id: 'p-tox', branch_id: 'b1', current_stock: 10, current_rendimento: 1_000 }] })
    const emFrascos = await ajusteDeEstoqueCore(b.admin, ctx, { productId: 'p-tox', branchId: 'b1', novoSaldo: 10_000, motivo: 'Inventário' }) as { error: string }
    expect(emFrascos.error).toBe('No máximo 9.999,9999 frascos de uma vez (999.999,9999 UI, o limite do registro).')
    const emUi = await ajusteDeEstoqueCore(b.admin, ctx, { productId: 'p-tox', branchId: 'b1', novoSaldo: 1_000_000, motivo: 'Inventário', emConsumo: true }) as { error: string }
    expect(emUi.error).toBe('No máximo 999.999,9999 UI (o limite do registro).')
    expect(b.gravacoes).toEqual([])
    expect(await ajusteDeEstoqueCore(b.admin, ctx, { productId: 'p-tox', branchId: 'b1', novoSaldo: 9_999, motivo: 'Inventário' })).toHaveProperty('ok', true)
  })
})

describe('a transferência: o saldo da unidade de destino depois', () => {
  it('recusa o que passaria do registro no destino; o que falta na origem fica com a recusa do banco', async () => {
    const { recusaDoRegistroNaTransferencia } = await import('@/lib/estoque/movimentos') as unknown as {
      recusaDoRegistroNaTransferencia: (admin: unknown, p: { productId: string; origem: string; destino: string; quantidade: number }) => Promise<string | null>
    }
    const b = bancoFalso({ products: [LUVA], branch_product_stock: [
      { product_id: 'p-luva', branch_id: 'b1', current_stock: 10, current_rendimento: null },
      { product_id: 'p-luva', branch_id: 'b2', current_stock: 999_995, current_rendimento: null },
    ] })
    expect(await recusaDoRegistroNaTransferencia(b.admin, { productId: 'p-luva', origem: 'b1', destino: 'b2', quantidade: 10 }))
      .toBe('O saldo passaria de 999.999,9999 cx (o limite do registro).')
    expect(await recusaDoRegistroNaTransferencia(b.admin, { productId: 'p-luva', origem: 'b1', destino: 'b2', quantidade: 4 })).toBeNull()
    // Mais do que a origem tem: "Estoque insuficiente na unidade de origem", do banco.
    expect(await recusaDoRegistroNaTransferencia(b.admin, { productId: 'p-luva', origem: 'b1', destino: 'b2', quantidade: 2_000_000 })).toBeNull()
  })
  it('a action da transferência confere antes de chamar o banco', () => {
    const fonte = readFileSync(path.resolve(__dirname, '../actions/stock.ts'), 'utf8')
    const transferir = fonte.slice(fonte.indexOf('async function adminTransferStockInterno'), fonte.indexOf("admin.rpc('estoque_transferir'"))
    expect(transferir).toContain('recusaDoRegistroNaTransferencia(')
  })
})

describe('a baixa do atendimento: a quantidade digitada e o saldo que falta', () => {
  it('recusa a quantidade e o saldo negativo que o registro não guarda, em português', async () => {
    const { montarInsumosDaBaixa } = await import('@/lib/atendimento/insumos-da-baixa')
    const b = bancoFalso({ products: [LUVA], branch_product_stock: [{ product_id: 'p-luva', branch_id: 'b1', current_stock: -500_000, current_rendimento: null, min_stock: 0 }] })
    await expect(montarInsumosDaBaixa(b.admin, 't1', 'b1', new Map([['p-luva', 2_000_000]]))).rejects.toThrow('No máximo 999.999,9999 cx de uma vez (o limite do registro).')
    await expect(montarInsumosDaBaixa(b.admin, 't1', 'b1', new Map([['p-luva', 600_000]]))).rejects.toThrow('O saldo passaria de −999.999,9999 cx (o limite do registro).')
    const ok = await montarInsumosDaBaixa(b.admin, 't1', 'b1', new Map([['p-luva', 10]]))
    expect(ok.insumos).toHaveLength(1)
  })
})

describe('o cadastro do produto: o custo e o estoque inicial', () => {
  it('a action confere o custo do cadastro e o da entrada inicial pela mesma régua da entrada', () => {
    const fonte = readFileSync(path.resolve(__dirname, '../actions/stock.ts'), 'utf8')
    const cadastrar = fonte.slice(fonte.indexOf('async function createProductInterno'), fonte.indexOf("admin.rpc('produto_cadastrar'"))
    expect(cadastrar).toContain("recusaDoCustoDaEntrada(num(formData, 'cost_price'))")
    expect(cadastrar).toContain('recusaDoCustoDaEntrada(initialCost)')
    expect(cadastrar).toContain('recusaDoEstoqueAcimaDoRegistro(')
  })
})

describe('criarOportunidadeCore: o valor estimado que o registro não guarda', () => {
  it('recusa em português, sem tentar gravar; o negativo também', async () => {
    const { criarOportunidadeCore } = await import('@/lib/crm/oportunidade')
    const b = bancoFalso({})
    expect(await criarOportunidadeCore(b.admin, ctx, { nome: 'Ana', email: 'ana@exemplo.com', valor: 10_000_000_000 }))
      .toEqual({ error: 'No máximo 9.999.999.999,99 reais (o limite do registro).' })
    expect(await criarOportunidadeCore(b.admin, ctx, { nome: 'Ana', email: 'ana@exemplo.com', valor: -1 }))
      .toEqual({ error: 'O valor estimado não pode ser negativo.' })
    expect(b.gravacoes).toEqual([])
  })
})
