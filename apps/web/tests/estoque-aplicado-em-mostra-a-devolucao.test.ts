import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A5 da 38ª simulação (atendimento:ES-25, "para o recall, o que o lote
 * entregou de fato"; princípio 3): a venda a receber da Aparecida foi
 * cancelada e o Óleo voltou ao estoque, e o "Aplicado em" do lote OC1 seguia
 * dizendo "venda · 1 un", sem a volta. A venda devolvida diz a devolução, e a
 * quantidade que voltou inteira sai riscada.
 */
const raiz = join(__dirname, '..')
const fonte = (a: string) => readFileSync(join(raiz, a), 'utf8').replace(/\r/g, '')

describe('o "Aplicado em" mostra a devolução da venda', () => {
  it('a devolução de cada venda: a venda estornada com o produto de volta, ou as unidades devolvidas da linha', async () => {
    const { devolucaoDaVenda } = await import('@/lib/estoque/devolucao-no-lote')
    expect(devolucaoDaVenda({ estornadaEm: '2026-11-27T13:00:00Z', produtoVoltou: true, devolvidas: 0, devolvidaEm: null }))
      .toEqual({ toda: true, unidades: null, quando: '2026-11-27T13:00:00Z' })
    // Estornada sem a volta: a cliente ficou com o produto — o lote o entregou.
    expect(devolucaoDaVenda({ estornadaEm: '2026-11-27T13:00:00Z', produtoVoltou: false, devolvidas: 0, devolvidaEm: null })).toBeNull()
    expect(devolucaoDaVenda({ estornadaEm: null, produtoVoltou: null, devolvidas: 1, devolvidaEm: '2026-11-27T14:00:00Z' }))
      .toEqual({ toda: false, unidades: 1, quando: '2026-11-27T14:00:00Z' })
    expect(devolucaoDaVenda({ estornadaEm: null, produtoVoltou: null, devolvidas: 0, devolvidaEm: null })).toBeNull()
  })

  it('o rótulo curto da devolução', async () => {
    const { rotuloDaDevolucao } = await import('@/lib/estoque/devolucao-no-lote')
    const dia = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
    expect(rotuloDaDevolucao({ toda: true, unidades: null, quando: '2026-11-27T13:00:00Z' }, 'un', dia)).toBe('Voltou ao estoque em 27/11')
    expect(rotuloDaDevolucao({ toda: false, unidades: 2, quando: '2026-11-27T13:00:00Z' }, 'frasco', dia)).toBe('Devolução de 2 frascos em 27/11')
    expect(rotuloDaDevolucao({ toda: false, unidades: 1, quando: null }, 'un', dia)).toBe('Devolução de 1 un')
  })

  it('a leitura do lote traz o estorno e a devolução da venda, e a janela os mostra', () => {
    const s = fonte('lib/estoque/aplicacoes-do-lote.ts')
    expect(s).toMatch(/estornada_em, produto_voltou/)
    expect(s).toMatch(/devolvidas, devolucao_movement_id/)
    expect(s).toMatch(/devolucao: devolucaoDaVenda\(/)
    const tela = fonte('components/admin/aplicacoes-do-lote.tsx')
    expect(tela).toMatch(/data-venda-devolvida/)
    expect(tela).toMatch(/rotuloDaDevolucao\(/)
    expect(tela).toMatch(/a\.devolucao\?\.toda \? 'line-through'/)
  })
})
