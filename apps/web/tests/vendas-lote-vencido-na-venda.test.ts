import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D3 da 38ª simulação (atendimento:ES-24, "o vencido é sinalizado, não
 * bloqueado"): a venda da Damiana levou 1 Protetor do PS2 e 1 do PS1, vencido
 * — a ordem de saída estava certa (o válido primeiro, o vencido por último),
 * mas nem a venda nem a comanda diziam que uma unidade saía de lote vencido,
 * nem antes de vender, nem depois. A sessão de atendimento já diz de qual lote
 * sai o insumo (`lib/estoque/fefo.ts`); a venda usa a mesma conta.
 */
const raiz = join(__dirname, '..')
const fonte = (a: string) => readFileSync(join(raiz, a), 'utf8').replace(/\r/g, '')

const HOJE = new Date('2026-11-27T15:00:00Z')
const lotes = [
  { id: 'ps1', numero: 'PS1', validade: '2026-11-14', recebidoEm: '2026-10-01T12:00:00Z', quantidade: 5 },
  { id: 'ps2', numero: 'PS2', validade: '2027-05-01', recebidoEm: '2026-11-01T12:00:00Z', quantidade: 1 },
]

describe('o que sai de lote vencido numa venda de produto', () => {
  it('o válido sai primeiro; o que passa dele sai do vencido, e é isso que se sinaliza', async () => {
    const { partesVencidasDaSaida } = await import('@/lib/vendas/lote-vencido')
    expect(partesVencidasDaSaida(lotes, 1, HOJE)).toEqual([])
    expect(partesVencidasDaSaida(lotes, 2, HOJE)).toEqual([{ numero: 'PS1', validade: '2026-11-14', quantidade: 1 }])
    // O que já sai antes (outra linha do mesmo produto na comanda) entra na conta.
    expect(partesVencidasDaSaida(lotes, 1, HOJE, undefined, 1)).toEqual([{ numero: 'PS1', validade: '2026-11-14', quantidade: 1 }])
    // No dia da validade o lote ainda vale (ES-24).
    expect(partesVencidasDaSaida(lotes, 2, new Date('2026-11-14T15:00:00Z'))).toEqual([])
    // Sem lote nenhum, nada a dizer.
    expect(partesVencidasDaSaida([], 3, HOJE)).toEqual([])
  })

  it('o rótulo é curto: quanto, de qual lote e quando venceu — "sai" antes, "saiu" depois', async () => {
    const { textoDoVencidoNaVenda } = await import('@/lib/vendas/lote-vencido')
    const uma = [{ numero: 'PS1', validade: '2026-11-14', quantidade: 1 }]
    expect(textoDoVencidoNaVenda(uma, 'un')).toBe('1 un sai do lote PS1, vencido em 14/11/2026')
    expect(textoDoVencidoNaVenda(uma, 'un', true)).toBe('1 un saiu do lote PS1, vencido em 14/11/2026')
    expect(textoDoVencidoNaVenda([{ numero: null, validade: '2026-11-14', quantidade: 2 }], 'frasco'))
      .toBe('2 frascos saem do lote sem número, vencido em 14/11/2026')
    expect(textoDoVencidoNaVenda([{ numero: 'A', validade: '2026-11-14', quantidade: 2 }], 'un', true))
      .toBe('2 un saíram do lote A, vencido em 14/11/2026')
    expect(textoDoVencidoNaVenda([], 'un')).toBeNull()
  })

  it('os produtos à venda levam os lotes com saldo da unidade', () => {
    const s = fonte('lib/produtos/leitura.ts')
    expect(s).toMatch(/from\('product_batches'\)/)
    expect(s).toMatch(/\.eq\('branch_id', branchId\)\.gt\('quantity', 0\)/)
    expect(fonte('components/shared/vender.tsx')).toMatch(/lotes\?: LoteParaBaixa\[\]/)
  })

  it('a venda sozinha sinaliza na linha do produto, sem desligar o botão, e diz no "deu certo"', () => {
    const s = fonte('components/shared/vender.tsx')
    expect(s).toMatch(/partesVencidasDaSaida\(/)
    expect(s).toMatch(/data-lote-vencido-na-venda/)
    // Não bloqueia: o vencido não entra no disabled do Vender.
    const botao = s.slice(s.indexOf("{pendente ? 'Vendendo…'") - 400, s.indexOf("{pendente ? 'Vendendo…'"))
    expect(botao).not.toMatch(/vencid/i)
    expect(s).toMatch(/toast\.success\(\[avisoDaVenda\([\s\S]{0,300}textoDoVencidoNaVenda\([\s\S]{0,120}, true\)\)/)
  })

  it('a comanda do PDV sinaliza o produto ainda não vendido', () => {
    const s = fonte('components/shared/pdv/produtos-da-comanda.tsx')
    expect(s).toMatch(/partesVencidasDaSaida\(/)
    expect(s).toMatch(/data-lote-vencido-na-venda/)
    expect(fonte('app/_shared/pdv.tsx')).toMatch(/disponivel: p\.disponivel, lotes: p\.lotes/)
  })

  it('depois: o Histórico do produto diz que a venda saiu de lote vencido', () => {
    expect(fonte('actions/stock.ts')).toMatch(/vencidoNaSaida:/)
    expect(fonte('components/admin/admin-stock-manage-modal.tsx')).toMatch(/data-vencido-na-saida/)
  })
})
