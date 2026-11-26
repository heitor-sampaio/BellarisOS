import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recusaDaEmbalagem, avisoDaEmbalagem } from '@/lib/estoque/medidas'

vi.setConfig({ testTimeout: 30_000 })

/**
 * D2 da 31ª simulação (2026-11-26): o alginato foi cadastrado com a embalagem
 * "g" e o conteúdo de 1000 g. A embalagem é o que se compra e se conta na
 * prateleira (ES-17: "Continuam em embalagens o que se digita na entrada e na
 * transferência, o preço, o saldo, o mínimo e os lotes"); o conteúdo é quanto
 * ela tem, na medida de uso. "1 g com 1000 g" não existe — e toda tela que conta
 * embalagens chamava o pote de "g": a Entrada pedia "Quantidade g" e gravava
 * potes (999 viraram 999 potes = 999.000 g), o lote dizia "1,91 g · custo
 * R$ 120,00/g", o dashboard "950 g · 0,95 g" e o cartão do Copilot
 * "970 → 950.000 g, muda o saldo em 97.838%".
 *
 * Decisão do Claude, 26/11 (princípios 2, 3 e 7): é IMPOSSÍVEL — e se recusa,
 * no servidor — a embalagem e o conteúdo na mesma grandeza com a conta errada
 * ("1 g com 1000 g", "1 kg com 500 g"); "1 kg com 1000 g" e "1 L com 1000 ml"
 * fecham. A embalagem que é uma medida sem conteúdo (contar direto em g) segue
 * valendo. A embalagem que é uma medida com o conteúdo noutra grandeza ("ml com
 * 50 g") é improvável: avisa. O que já está gravado assim se lê como está, e a
 * tela avisa (a Entrada e o cadastro dizem o que corrigir).
 */
describe('a embalagem e o conteúdo do produto', () => {
  it('"1 g com 1000 g" é impossível, e a recusa diz o que fazer', () => {
    const r = recusaDaEmbalagem('g', 1000, 'g')
    expect(r).not.toBeNull()
    expect(r).toContain('1 g com 1.000 g')
    expect(r).toMatch(/a embalagem é o que se compra/)
  })
  it('"1 kg com 500 g" é impossível (1 kg tem 1.000 g); "1 kg com 1000 g" e "1 L com 1000 ml" fecham', () => {
    expect(recusaDaEmbalagem('kg', 500, 'g')).toContain('1 kg tem 1.000 g')
    expect(recusaDaEmbalagem('kg', 1000, 'g')).toBeNull()
    expect(recusaDaEmbalagem('L', 1000, 'ml')).toBeNull()
    expect(recusaDaEmbalagem('ml', 1000, 'ml')).not.toBeNull()
    expect(recusaDaEmbalagem('UI', 100, 'UI')).not.toBeNull()
  })
  it('o formato de embalagem com conteúdo, e a medida sem conteúdo, valem', () => {
    expect(recusaDaEmbalagem('frasco', 100, 'ml')).toBeNull()
    expect(recusaDaEmbalagem('un', 1000, 'g')).toBeNull()
    expect(recusaDaEmbalagem('seringa', 1, 'ml')).toBeNull()
    expect(recusaDaEmbalagem('g', null, null)).toBeNull()
    expect(recusaDaEmbalagem('g', null, '')).toBeNull()
  })
  it('a medida como embalagem com o conteúdo noutra grandeza avisa, sem recusar', () => {
    expect(recusaDaEmbalagem('ml', 50, 'g')).toBeNull()
    expect(avisoDaEmbalagem('ml', 50, 'g')).toMatch(/“ml” é uma medida/)
    expect(avisoDaEmbalagem('frasco', 100, 'ml')).toBeNull()
    expect(avisoDaEmbalagem('kg', 1000, 'g')).toBeNull()
    expect(avisoDaEmbalagem('g', null, null)).toBeNull()
  })
})

const ler = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('a recusa vale no servidor, e a tela avisa', () => {
  it('o cadastro e a edição do produto recusam a embalagem impossível', () => {
    const acao = ler('actions', 'stock.ts')
    const chamadas = acao.match(/recusaDaEmbalagem\(unit, upp, consumo\)/g) ?? []
    expect(chamadas.length, 'createProduct e updateProduct').toBe(2)
  })
  it('o cadastro mostra a recusa e o aviso enquanto se escolhe', () => {
    const modal = ler('components', 'branch', 'stock-product-modal.tsx')
    expect(modal).toContain('recusaDaEmbalagem(')
    expect(modal).toContain('avisoDaEmbalagem(')
    expect(modal).toContain('data-embalagem-impossivel')
  })
  it('a Entrada diz quanto a quantidade vale no conteúdo, e avisa o cadastro impossível', () => {
    const modal = ler('components', 'admin', 'admin-stock-manage-modal.tsx')
    expect(modal).toContain('data-entrada-equivale')
    expect(modal).toContain('data-cadastro-da-embalagem')
  })
})

// O Copilot conta na medida que a pessoa disse, como o "Contar em" da janela de Ajuste.
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/auth', async orig => ({ ...(await orig<typeof import('@/lib/auth')>()), can: () => true }))
vi.mock('@/lib/unidades/fuso-da-unidade', () => ({
  fusoDaUnidade: async () => 'America/Sao_Paulo',
  fusoDaRede: async () => 'America/Sao_Paulo',
  fusoDoRecorte: async () => 'America/Sao_Paulo',
}))
vi.mock('@/lib/financeiro/vezes-da-rede', () => ({ maquininhasDaRede: async () => [] }))
vi.mock('@/lib/copilot/ferramentas/comum', async orig => ({
  ...(await orig<typeof import('@/lib/copilot/ferramentas/comum')>()),
  resolverUnidade: async () => ({ unidade: { id: 'b-itajai', name: 'Itajaí', slug: 'itajai' } }),
  fusoDe: async () => 'America/Sao_Paulo',
}))

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
const contexto = (tabelas: Record<string, unknown>) => ({
  ctx: { tenantId: 't1', branchId: null, unidades: null, internalUserId: 'u1', userName: 'Bia', isNetworkAdmin: true, permissions: {} },
  admin: admin(tabelas), pagina: '/admin/estoque', slugDoPortal: null,
}) as never

type Cartao = { erro?: string; resumo: { linhas: { rotulo: string; valor: string }[]; aviso?: string }; payload: { novoSaldo: number; emConsumo?: boolean } }

describe('ajuste_de_estoque conta na medida da tela', () => {
  const POTE = { id: 'p-alg', name: 'Alginato', unit: 'pote', consumption_unit: 'g', units_per_package: 1000, cost_price: 120, sale_price: null }
  const SALDO = [{ current_stock: 1, current_rendimento: 970 }]

  it('"ajusta para 950 g": com contarEm "consumo", a contagem é 950 g, não 950 potes', async () => {
    const { ajusteDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    expect(ajusteDeEstoque.parametros.safeParse({ produto: 'Alginato', novoSaldo: 950, motivo: 'Inventário', contarEm: 'consumo' }).success).toBe(true)
    const r = await ajusteDeEstoque.preparar(contexto({ products: [POTE], branch_product_stock: SALDO }),
      { produto: 'Alginato', novoSaldo: 950, motivo: 'Inventário', contarEm: 'consumo' } as never) as Cartao
    expect(r.erro).toBeUndefined()
    expect(r.payload.emConsumo).toBe(true)
    expect(r.resumo.linhas.find(l => l.rotulo === 'Saldo')?.valor).toBe('970 → 950 g (0,97 → 0,95 pote)')
    expect(r.resumo.aviso ?? '').not.toMatch(/muda o saldo/)
  })
  it('sem contarEm, segue a embalagem (o padrão da janela)', async () => {
    const { ajusteDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const r = await ajusteDeEstoque.preparar(contexto({ products: [POTE], branch_product_stock: SALDO }),
      { produto: 'Alginato', novoSaldo: 1, motivo: 'Inventário' }) as Cartao
    expect(r.payload.emConsumo).toBeFalsy()
    expect(r.resumo.linhas.find(l => l.rotulo === 'Saldo')?.valor).toBe('0,97 → 1 pote (970 → 1.000 g)')
  })
  it('o cadastro impossível ("1 g com 1000 g") avisa no cartão o que a contagem quer dizer', async () => {
    const { ajusteDeEstoque } = await import('@/lib/copilot/ferramentas/gestao-escrita')
    const G = { ...POTE, unit: 'g' }
    const r = await ajusteDeEstoque.preparar(contexto({ products: [G], branch_product_stock: SALDO }),
      { produto: 'Alginato', novoSaldo: 950, motivo: 'Inventário' }) as Cartao
    expect(r.resumo.aviso).toContain('1 g com 1.000 g')
  })
})
