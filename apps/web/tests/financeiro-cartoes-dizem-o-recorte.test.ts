import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DespesasDoCaixa } from '@/components/shared/despesas-do-caixa'

/**
 * Os cartões do Resumo do Financeiro não se contradizem (princípio 3):
 * - "Despesas pagas (caixa)" sobe com o pagamento das comissões (R$ 480 →
 *   R$ 1.258,31) e o Lucro não muda. A dica do cartão diz QUANTO do caixa é o
 *   pagamento das comissões e a compra de estoque, que o lucro não desconta de
 *   novo — os números são os de lib/metrics (`estoqueNoResultado`), a tela só
 *   os escreve.
 * - "A pagar" mostrava R$ 0,00 (o que vence no período) ao lado de "Em
 *   aberto: R$ 3.400": o rótulo e a nota dizem o recorte de cada número.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const texto = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

describe('A5: a dica das Despesas pagas (caixa) diz o que fica fora do lucro, com o valor', () => {
  it('com o pagamento das comissões no caixa: quanto é, e por que o lucro não muda', () => {
    const t = texto(renderToStaticMarkup(createElement(DespesasDoCaixa, {
      compraDeEstoque: 0, despesaDeComissoes: 778.31, nomeDoLucro: 'Lucro Líquido',
    })))
    expect(t).toContain('O que saiu do caixa no período.')
    expect(t).toMatch(/R\$\s778,31 do pagamento das comissões/)
    expect(t).not.toContain('compra de estoque R$')
    expect(t).toContain('fora do Lucro Líquido')
    expect(t).toContain('a comissão já sai do lucro quando é lançada')
  })

  it('com a compra de estoque também: as duas partes', () => {
    const t = texto(renderToStaticMarkup(createElement(DespesasDoCaixa, {
      compraDeEstoque: 300, despesaDeComissoes: 100, nomeDoLucro: 'Resultado líquido',
    })))
    expect(t).toMatch(/R\$\s100,00 do pagamento das comissões e R\$\s300,00 da compra de estoque/)
    expect(t).toContain('fora do Resultado líquido')
  })

  it('sem nenhuma das duas: só o que o cartão é', () => {
    const t = texto(renderToStaticMarkup(createElement(DespesasDoCaixa, {
      compraDeEstoque: 0, despesaDeComissoes: 0, nomeDoLucro: 'Lucro Líquido',
    })))
    expect(t).toContain('O que saiu do caixa no período.')
    expect(t).not.toMatch(/R\$/)
  })

  it('os dois financeiros usam a dica', () => {
    expect(ler('components/branch/financial-hub.tsx')).toMatch(/dica=\{<DespesasDoCaixa /)
    expect(ler('components/admin/admin-financial-view.tsx')).toMatch(/dica=\{<DespesasDoCaixa /)
  })
})

describe('A6: o "A pagar" diz o recorte de cada número', () => {
  it('o rótulo diz que o número grande é o que vence no período', async () => {
    const { ROTULO_DO_A_PAGAR } = await import('@/lib/financeiro/abas')
    expect(ROTULO_DO_A_PAGAR).toBe('A pagar · vence no período')
    expect(ler('components/branch/financial-hub.tsx')).toContain('label={ROTULO_DO_A_PAGAR}')
    expect(ler('components/admin/admin-financial-view.tsx')).toContain('label={ROTULO_DO_A_PAGAR}')
  })

  it('e a nota diz que o em aberto é de qualquer vencimento', () => {
    expect(ler('components/shared/nota-do-vencimento.tsx')).toContain('Em aberto, de qualquer vencimento: <strong>')
  })
})
