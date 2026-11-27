import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A11 da 35ª (ES-28; princípio 3): a venda de produto estornada cujo produto
 * NÃO voltou é perda "Venda estornada (não voltou)" nos Relatórios, mas o
 * Histórico do produto a mostrava como "Venda", sem marca; e a perda vinha nos
 * Relatórios → Estoque sem o lote ("lote —"): `metrics_perdas` não ligava a
 * venda ao movimento da saída, de onde vêm os lotes.
 */
const raiz = join(__dirname, '..')
const ler = (a: string) => readFileSync(join(raiz, a), 'utf8')
const migracoes = join(raiz, '..', '..', 'supabase', 'migrations')

describe('a venda estornada que não voltou, no estoque', () => {
  it('o movimento da venda diz de qual venda é (a referência "venda:<id>")', async () => {
    const { idDaVendaDoMovimento } = await import('@/lib/estoque/venda-do-movimento')
    const id = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
    expect(idDaVendaDoMovimento({ type: 'SALE', reference: `venda:${id}` })).toBe(id)
    expect(idDaVendaDoMovimento({ type: 'SALE', reference: null })).toBeNull()
    expect(idDaVendaDoMovimento({ type: 'SALE', reference: 'venda:x' })).toBeNull()
    expect(idDaVendaDoMovimento({ type: 'LOSS', reference: `venda:${id}` })).toBeNull()
  })

  it('o Histórico do produto marca a venda estornada sem volta, com o rótulo da perda', () => {
    const acao = ler('actions/stock.ts')
    expect(acao).toMatch(/idDaVendaDoMovimento/)
    expect(acao).toMatch(/produto_voltou/)
    expect(acao).toMatch(/vendaEstornadaSemVolta:/)
    expect(ler('components/admin/admin-stock-manage-modal.tsx'))
      .toMatch(/m\.vendaEstornadaSemVolta \? rotuloDoMotivo\(MOTIVO_VENDA_ESTORNADA\)/)
  })

  it('a perda da venda estornada traz os lotes do movimento da venda', () => {
    const nome = readdirSync(migracoes).find(n => n.startsWith('2026121420') && /perda.*venda.*lote|lote.*venda/.test(n))
    expect(nome, 'a migration da faixa V que liga a perda da venda ao movimento').toBeTruthy()
    const s = readFileSync(join(migracoes, nome!), 'utf8')
    expect(s).toMatch(/pg_temp\.trocar_no_corpo\(\s*'public\.metrics_perdas\(uuid,uuid\[\],timestamptz,timestamptz\)'::regprocedure/)
    expect(s).toMatch(/coalesce\(i\.stock_movement_id, v\.stock_movement_id\)/)
    expect(s).toMatch(/E'i\.stock_movement_id\\n\s+from public\.product_sale_returns r'/)
    expect(s.trim()).toMatch(/notify pgrst, 'reload schema';$/)
  })
})
