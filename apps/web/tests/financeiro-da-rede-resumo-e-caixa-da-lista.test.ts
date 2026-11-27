import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * O Financeiro da REDE com o que o da unidade tem (39ª simulação):
 * - D10 (FN-13): a lista da rede (Movimentações, A pagar, A receber) diz
 *   "N lançamentos · caixa da lista R$ …", a mesma linha da unidade, com o número
 *   de lib/metrics (resultadoDaLista) — a rede escrevia só "N registros".
 * - D11 (FN-02): o Resumo da rede tem os mesmos cartões do da unidade — a
 *   evolução, as formas de pagamento e as categorias (a despesa por categoria
 *   incluída) —, com os números da rede de lib/metrics, e não para no "Por unidade".
 * Os cartões são OS MESMOS componentes nos dois portais (não uma cópia).
 */

const raiz = path.resolve(__dirname, '..')
const fonte = (arq: string) => readFileSync(path.join(raiz, arq), 'utf8')

describe('a linha do caixa da lista (D10)', () => {
  it('diz quantos lançamentos e o caixa, com o sinal', async () => {
    const { CaixaDaLista } = await import('@/components/shared/caixa-da-lista')
    const html = renderToStaticMarkup(createElement(CaixaDaLista, { lancamentos: 2, caixa: -2400 }))
    expect(html).toContain('data-total-da-lista')
    expect(html.replace(/ /g, ' ')).toContain('2 lançamentos · caixa da lista −R$ 2.400,00')
  })
  it('no singular, um lançamento', async () => {
    const { CaixaDaLista } = await import('@/components/shared/caixa-da-lista')
    const html = renderToStaticMarkup(createElement(CaixaDaLista, { lancamentos: 1, caixa: 100 }))
    expect(html.replace(/ /g, ' ')).toContain('1 lançamento · caixa da lista R$ 100,00')
  })
  it('a unidade e a rede usam a mesma linha, e a rede soma por lib/metrics', () => {
    expect(fonte('components/branch/financial-table.tsx')).toContain('<CaixaDaLista')
    const rede = fonte('components/admin/admin-financial-view.tsx')
    expect(rede).toContain('<CaixaDaLista')
    expect(rede).toContain('resultadoDaLista(')
    // o "N registros" do cabeçalho sai; o rodapé "Exibindo 100 de N registros" fica (listas-sem-corte)
    expect(rede).not.toMatch(/\{visibleTxs\.length\} registro\{/)
  })
})

describe('os cartões do Resumo (D11)', () => {
  const composicao = {
    formas:   [{ chave: 'PIX', valor: 100 }, { chave: 'DEBIT_CARD', valor: 62 }],
    receitas: [{ chave: 'Serviços', valor: 162 }],
    despesas: [{ chave: 'Aluguel', valor: 2500 }],
  }
  it('a evolução, as formas e as categorias de receita e de despesa', async () => {
    const { DetalhesDoPeriodo } = await import('@/components/shared/detalhes-do-periodo')
    const html = renderToStaticMarkup(createElement(DetalhesDoPeriodo, {
      serie: [], period: 'month', periodStart: '2026-11-01T03:00:00.000Z',
      composicao, receita: 162, despesa: 2500,
    })).replace(/ /g, ' ')
    for (const titulo of ['Evolução financeira', 'Formas de pagamento', 'Categorias de receita', 'Categorias de despesa']) {
      expect(html, titulo).toContain(titulo)
    }
    expect(html).toContain('Aluguel')
    expect(html).toContain('R$ 2.500,00')
    expect(html).toContain('Débito')
  })
  it('a unidade e a rede desenham os mesmos cartões; a rede com a série e a composição de lib/metrics', () => {
    const unidade = fonte('components/branch/financial-hub.tsx')
    expect(unidade).toContain('<DetalhesDoPeriodo')
    expect(unidade).not.toMatch(/function (EvolutionChart|DonutChart|CategoryBars)\b/)
    expect(fonte('components/admin/admin-financial-view.tsx')).toContain('<DetalhesDoPeriodo')
    const pagina = fonte('app/admin/financeiro/page.tsx')
    expect(pagina).toContain('getSeries(')
    expect(pagina).toContain('getComposicaoFinanceira(')
  })
})
