import { describe, it, expect, vi } from 'vitest'

// O primeiro import() de uma ferramenta carrega o Supabase e o núcleo.
vi.setConfig({ testTimeout: 30_000 })

/**
 * O Copilot recusa o MESMO que a tela e a action do mesmo gesto — nem mais,
 * nem menos (o Heitor, 25/11: "Se não for impossível, ainda que improvável,
 * pode ser feito."; princípio 2). O Copilot tinha tetos que a tela não tem:
 * lançar até R$ 10.000.000, entrada até 100.000 embalagens e custo até
 * R$ 1.000.000, ajuste até 1.000.000, oportunidade até R$ 10.000.000 e com
 * até 5 procedimentos de interesse, e até 10 tags por pedido. E recusava o
 * que a tela aceita (o custo zero da entrada, o valor estimado zero), em
 * inglês ("Number must be less than or equal to…").
 *
 * O que sobra é o impossível (decisão do Claude, 25/11): o zero ou o negativo
 * onde a tela recusa, e o que o REGISTRO não guarda — o tipo da coluna:
 * `financial_transactions.amount` e `products.cost_price` são numeric(10,2)
 * (até 99.999.999,99), `leads.value` é numeric(12,2) (até 9.999.999.999,99),
 * e a quantidade e o saldo do estoque (`stock_movements.quantity` e
 * `balance_after`, `product_batches.quantity`) são numeric(10,4) — até
 * 999.999,9999 na unidade do movimento, que é a de CONSUMO quando o produto
 * tem uma (o frasco de 100 UI: até 9.999,9999 frascos).
 */

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/auth', async orig => ({ ...(await orig<typeof import('@/lib/auth')>()), can: () => true }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
  fusoDoRecorte: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/financeiro/vezes-da-rede', () => ({ maquininhasDaRede: async () => [] }))
const CENTRO = { id: 'b-centro', name: 'Centro', slug: 'centro' }
vi.mock('@/lib/copilot/ferramentas/comum', async orig => ({
  ...(await orig<typeof import('@/lib/copilot/ferramentas/comum')>()),
  resolverUnidade: async () => ({ unidade: CENTRO }),
  fusoDe: async () => 'America/Sao_Paulo',
}))

const INGLES = /number|must|expected|too (big|small)|invalid|greater|less/i

/** A mensagem da recusa do zod (a que volta ao modelo), ou null se passou. */
function recusa(r: { success: boolean; error?: { issues: { message: string }[] } }): string | null {
  return r.success ? null : r.error!.issues.map(i => i.message).join(' | ')
}

/** Um cliente do banco falso: cada tabela devolve a linha (ou a lista) do cenário. */
function admin(tabelas: Record<string, unknown>) {
  const from = (tabela: string) => {
    const b: Record<string, unknown> = {}
    let unico = false
    for (const op of ['select', 'eq', 'ilike', 'in', 'is', 'order', 'limit']) b[op] = () => b
    b.single = () => { unico = true; return b }
    b.maybeSingle = () => { unico = true; return b }
    b.then = (ok: (r: unknown) => unknown) => {
      const linhas = (tabelas[tabela] ?? []) as unknown[]
      return Promise.resolve({ data: unico ? linhas[0] ?? null : linhas, error: null }).then(ok)
    }
    return b
  }
  return { from }
}

const contexto = (tabelas: Record<string, unknown> = {}) => ({
  ctx: { tenantId: 't1', branchId: null, unidades: null, internalUserId: 'u1', userName: 'Bia', isNetworkAdmin: true, permissions: {} },
  admin: admin(tabelas), pagina: '/admin/estoque', slugDoPortal: null,
}) as never

/** O frasco de toxina: 100 UI por frasco (a unidade do movimento é a UI). */
const TOXINA = { id: 'p-tox', name: 'Toxina', unit: 'frasco', consumption_unit: 'UI', units_per_package: 100, cost_price: 100, sale_price: 300 }
const LUVA = { id: 'p-luva', name: 'Luva', unit: 'cx', consumption_unit: null, units_per_package: null, cost_price: null, sale_price: null }

describe('lancar: o valor que a tela aceita, o Copilot aceita', () => {
  it('passa de R$ 10.000.000 (o teto que só o Copilot tinha) até o limite do registro', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { tipo: 'despesa', descricao: 'Reforma', categoria: 'Outro', vencimento: '2026-12-01' }
    expect(recusa(lancar.parametros.safeParse({ ...base, valor: 50_000_000 }))).toBeNull()
    expect(recusa(lancar.parametros.safeParse({ ...base, valor: 99_999_999.99 }))).toBeNull()
  })
  it('recusa só o impossível, em português: o zero (como a tela) e o que o registro não guarda', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { tipo: 'despesa', descricao: 'Reforma', categoria: 'Outro', vencimento: '2026-12-01' }
    const zero = recusa(lancar.parametros.safeParse({ ...base, valor: 0 }))
    expect(zero).toBe('Valor deve ser maior que zero.')
    const acima = recusa(lancar.parametros.safeParse({ ...base, valor: 100_000_000 }))
    expect(acima).toContain('99.999.999,99')
    expect(acima).toContain('o limite do registro')
    expect(acima).not.toMatch(INGLES)
  })
  it('o valor que o arredondamento leva a zero é recusado no preparo, antes do cartão', async () => {
    const { lancar } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await lancar.preparar(contexto(), { tipo: 'despesa', descricao: 'Reforma', categoria: 'Outro', categoriaDaPessoa: true, vencimento: '2026-12-01', valor: 0.004 })
    expect(r).toEqual({ erro: 'Valor deve ser maior que zero.' })
  })
})

describe('entrada_de_estoque: a quantidade e o custo da janela de Entrada', () => {
  it('passa das 100.000 embalagens e do custo de R$ 1.000.000; aceita o custo zero, como a janela', async () => {
    const { entradaDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(recusa(entradaDeEstoque.parametros.safeParse({ produto: 'Luva', quantidade: 500_000 }))).toBeNull()
    expect(recusa(entradaDeEstoque.parametros.safeParse({ produto: 'Luva', quantidade: 10, custoUnitario: 5_000_000 }))).toBeNull()
    expect(recusa(entradaDeEstoque.parametros.safeParse({ produto: 'Luva', quantidade: 10, custoUnitario: 0 }))).toBeNull()
  })
  it('recusa em português o zero, o custo negativo e o que o registro não guarda', async () => {
    const { entradaDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(recusa(entradaDeEstoque.parametros.safeParse({ produto: 'Luva', quantidade: 0 }))).toBe('Quantidade deve ser maior que zero.')
    const negativo = recusa(entradaDeEstoque.parametros.safeParse({ produto: 'Luva', quantidade: 1, custoUnitario: -1 }))
    expect(negativo).toBe('O custo unitário não pode ser negativo.')
    const custo = recusa(entradaDeEstoque.parametros.safeParse({ produto: 'Luva', quantidade: 1, custoUnitario: 100_000_000 }))
    expect(custo).toContain('o limite do registro')
    expect(custo).not.toMatch(INGLES)
    const qtd = recusa(entradaDeEstoque.parametros.safeParse({ produto: 'Luva', quantidade: 1_000_000 }))
    expect(qtd).toContain('o limite do registro')
    expect(qtd).not.toMatch(INGLES)
  })
  it('no produto com unidade de consumo, o limite é o da UI (o movimento) e o do saldo depois', async () => {
    const { entradaDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const c = contexto({ products: [TOXINA], branch_product_stock: [{ current_stock: 9_990, current_rendimento: 999_000 }] })
    // 10.000 frascos são 1.000.000 UI: o movimento não guarda.
    const muitos = await entradaDeEstoque.preparar(c, { produto: 'Toxina', quantidade: 10_000 }) as { erro?: string }
    expect(muitos.erro).toContain('o limite do registro')
    expect(muitos.erro).toContain('9.999,9999 frascos')
    // 20 frascos (2.000 UI) levariam o saldo de 999.000 UI a 1.001.000 UI.
    const saldo = await entradaDeEstoque.preparar(c, { produto: 'Toxina', quantidade: 20 }) as { erro?: string }
    expect(saldo.erro).toContain('O saldo passaria de')
    expect(saldo.erro).toContain('o limite do registro')
    const cabe = await entradaDeEstoque.preparar(c, { produto: 'Toxina', quantidade: 5 }) as { erro?: string; resumo?: unknown }
    expect(cabe.erro).toBeUndefined()
    expect(cabe.resumo).toBeDefined()
  })
  it('o cartão diz o aviso do custo fora do comum que a janela de Entrada diz, sem recusar', async () => {
    const { entradaDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const { avisoDoCustoDaEntrada } = await import('@/lib/estoque/custo-da-entrada')
    const c = contexto({ products: [TOXINA], branch_product_stock: [{ current_stock: 1, current_rendimento: 100 }] })
    const r = await entradaDeEstoque.preparar(c, { produto: 'Toxina', quantidade: 1, custoUnitario: 2_000 }) as { resumo: { aviso?: string; linhas: { rotulo: string; valor: string }[] }; payload: { custoUnitario: number | null } }
    expect(r.resumo.aviso).toContain(avisoDoCustoDaEntrada(2_000, { custo: 100, venda: 300 })!)
    expect(r.payload.custoUnitario).toBe(2_000)
  })
  it('o custo zero vai ao cartão e ao payload (é o que se grava)', async () => {
    const { entradaDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const c = contexto({ products: [LUVA], branch_product_stock: [] })
    const r = await entradaDeEstoque.preparar(c, { produto: 'Luva', quantidade: 2, custoUnitario: 0 }) as { resumo: { linhas: { rotulo: string; valor: string }[] }; payload: { custoUnitario: number | null } }
    expect(r.payload.custoUnitario).toBe(0)
    expect(r.resumo.linhas.find(l => l.rotulo === 'Custo unitário')?.valor).toMatch(/R\$\s*0,00/)
  })
})

describe('ajuste_de_estoque: a contagem da janela de Ajuste', () => {
  it('a contagem vai até o limite do registro, e o negativo se recusa com a frase da tela', async () => {
    const { ajusteDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(recusa(ajusteDeEstoque.parametros.safeParse({ produto: 'Luva', novoSaldo: 999_999, motivo: 'Inventário' }))).toBeNull()
    expect(recusa(ajusteDeEstoque.parametros.safeParse({ produto: 'Luva', novoSaldo: -1, motivo: 'Inventário' }))).toBe('Novo estoque não pode ser negativo.')
    const acima = recusa(ajusteDeEstoque.parametros.safeParse({ produto: 'Luva', novoSaldo: 1_000_000, motivo: 'Inventário' }))
    expect(acima).toContain('o limite do registro')
    expect(acima).not.toMatch(INGLES)
  })
  it('no produto com unidade de consumo, a contagem em embalagens vale na UI', async () => {
    const { ajusteDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const c = contexto({ products: [TOXINA], branch_product_stock: [{ current_stock: 10, current_rendimento: 1_000 }] })
    const r = await ajusteDeEstoque.preparar(c, { produto: 'Toxina', novoSaldo: 10_000, motivo: 'Inventário' }) as { erro?: string }
    expect(r.erro).toContain('o limite do registro')
    const ok = await ajusteDeEstoque.preparar(c, { produto: 'Toxina', novoSaldo: 9_999, motivo: 'Inventário' }) as { erro?: string }
    expect(ok.erro).toBeUndefined()
  })
})

describe('criar_oportunidade: o valor estimado e os procedimentos de interesse da janela', () => {
  it('o valor passa de R$ 10.000.000 e aceita o zero, como a janela; os procedimentos, sem o limite de 5', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { nome: 'Ana', email: 'ana@exemplo.com' }
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, valor: 50_000_000 }))).toBeNull()
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, valor: 0 }))).toBeNull()
    const oito = Array.from({ length: 8 }, (_, i) => `Procedimento ${i + 1}`)
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, interesse: oito }))).toBeNull()
  })
  it('recusa em português o negativo (a frase da janela) e o que o registro não guarda', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const base = { nome: 'Ana', email: 'ana@exemplo.com' }
    expect(recusa(criarOportunidade.parametros.safeParse({ ...base, valor: -1 }))).toBe('O valor estimado não pode ser negativo.')
    const acima = recusa(criarOportunidade.parametros.safeParse({ ...base, valor: 10_000_000_000 }))
    expect(acima).toContain('9.999.999.999,99')
    expect(acima).toContain('o limite do registro')
  })
  it('o valor zero vai ao cartão e ao payload', async () => {
    const { criarOportunidade } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await criarOportunidade.preparar(contexto(), { nome: 'Ana', email: 'ana@exemplo.com', valor: 0 }) as { resumo: { linhas: { rotulo: string; valor: string }[] }; payload: { valor?: number } }
    expect(r.payload.valor).toBe(0)
    expect(r.resumo.linhas.find(l => l.rotulo === 'Valor')?.valor).toMatch(/R\$\s*0,00/)
  })
})

describe('marcar_tags: quantas tags a ficha marca, o Copilot marca', () => {
  it('sem o limite de 10 por pedido', async () => {
    const { marcarTags } = await import('@/lib/copilot/ferramentas/clientes-escrita')
    const quinze = Array.from({ length: 15 }, (_, i) => `Tag ${i + 1}`)
    expect(recusa(marcarTags.parametros.safeParse({ cliente: 'Ana', adicionar: quinze, remover: quinze }))).toBeNull()
  })
})

describe('o limite do estoque (puro)', () => {
  it('a quantidade, a quantidade na unidade de consumo e o saldo depois', async () => {
    const m = await import('@/lib/copilot/ferramentas/limites-do-registro') as Record<string, unknown>
    const recusaDoEstoque = m.recusaDoEstoqueAcimaDoRegistro as (a: { quantidade: number; fator: number; saldoDepois?: number | null; medida: string; consumo?: string | null }) => string | null
    expect(m.LIMITE_DO_ESTOQUE).toBe(999_999.9999)
    expect(m.LIMITE_DO_DINHEIRO).toBe(99_999_999.99)
    expect(m.LIMITE_DO_VALOR_DA_OPORTUNIDADE).toBe(9_999_999_999.99)
    expect(recusaDoEstoque({ quantidade: 9_999, fator: 100, saldoDepois: 999_900, medida: 'frascos', consumo: 'UI' })).toBeNull()
    expect(recusaDoEstoque({ quantidade: 10_000, fator: 100, medida: 'frascos', consumo: 'UI' })).toBe('No máximo 9.999,9999 frascos de uma vez (999.999,9999 UI, o limite do registro).')
    expect(recusaDoEstoque({ quantidade: 1_000_000, fator: 1, medida: 'cx' })).toBe('No máximo 999.999,9999 cx (o limite do registro).')
    expect(recusaDoEstoque({ quantidade: 1, fator: 1, saldoDepois: 1_000_000.5, medida: 'cx' })).toBe('O saldo passaria de 999.999,9999 cx (o limite do registro).')
  })
})
