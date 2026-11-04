import { describe, it, expect } from 'vitest'
import { descricaoDaVenda } from '@/lib/metrics/vendas-comum'

/**
 * D12 da 6ª simulação (2026-11-04), regressão da F11: desde a venda de vários
 * produtos, `product_sales.descricao` já lista os itens ("1× Protetor + 1×
 * Sérum") — e as Vendas e o CSV antepunham a quantidade de novo: "2× 1×
 * Protetor FPS 50 + 1× Sérum vitamina C", que se lê "dois kits".
 */
describe('descricaoDaVenda', () => {
  it('o kit não ganha outro prefixo de quantidade', () => {
    expect(descricaoDaVenda({ tipo: 'PRODUTO', descricao: '1× Protetor FPS 50 + 1× Sérum vitamina C', quantidade: 2 }))
      .toBe('1× Protetor FPS 50 + 1× Sérum vitamina C')
  })

  it('a venda de um produto só, gravada já com a quantidade, também não', () => {
    expect(descricaoDaVenda({ tipo: 'PRODUTO', descricao: '2× Sérum vitamina C', quantidade: 2 }))
      .toBe('2× Sérum vitamina C')
  })

  it('a venda de antes (só o nome do produto) continua com a quantidade', () => {
    expect(descricaoDaVenda({ tipo: 'PRODUTO', descricao: 'Sérum vitamina C', quantidade: 3 }))
      .toBe('3× Sérum vitamina C')
  })

  it('o pré-pago segue "3× Botox"', () => {
    expect(descricaoDaVenda({ tipo: 'PRE_PAGO', descricao: 'Botox', quantidade: 3 })).toBe('3× Botox')
  })
})
