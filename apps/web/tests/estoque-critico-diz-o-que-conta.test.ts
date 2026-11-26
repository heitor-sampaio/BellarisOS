import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * D22 da 31ª (ES-30, §13.1; princípio 3): "o painel conta 1, a lista conta 2".
 * O Sérum estava abaixo do mínimo em Blumenau e no mínimo em Itajaí.
 *
 * As duas contas já seguem a mesma régua (no mínimo OU abaixo dele é crítico:
 * `estoqueBaixo` na tela, `saldo <= mínimo` em `metrics_relatorio`) e a mesma
 * regra do D19 da 8ª (atendimento.md: "É UMA conta de PRODUTOS em todo
 * lugar"): o total conta o PRODUTO uma vez; a linha de cada unidade, o produto
 * NELA. O que faltava era a tela dizer qual é qual — como já diz o "Produtos
 * zerados" (D14 da 30ª). Decisão do Claude, 26/11:
 * - Relatórios → Estoque: o cartão se chama "Produtos críticos" (conta
 *   produtos, não pares unidade × produto) e diz a conta na dica; a dica da
 *   "Saúde do Estoque por Unidade" diz também o "Críticos" de cada linha.
 * - Dashboard da rede: a lista "Estoque crítico" diz que cada linha é um
 *   produto numa unidade, e o número dela é o de linhas — todas, não as 20
 *   que a página manda (com 25, dizia 20).
 */

const fonte = (arq: string) => readFileSync(path.resolve(__dirname, '..', arq), 'utf8')

describe('D22: Relatórios → Estoque diz o que o "críticos" conta', () => {
  const t = fonte('components/admin/reports-bi-view.tsx')
  it('o cartão conta PRODUTOS e diz a conta na dica', () => {
    expect(t).toMatch(/<KpiCard label="Produtos críticos"[^>]*rotuloDoSobre="O que conta como produto crítico"/)
    expect(t).not.toMatch(/label="Itens Críticos"/)
  })
  it('a tabela por unidade diz o "Críticos" de cada linha', () => {
    const tabela = t.match(/title="Saúde do Estoque por Unidade"[\s\S]*?sobre="([^"]*)"/)
    expect(tabela?.[1]).toMatch(/Críticos:/)
    expect(tabela?.[1]).toMatch(/Produtos críticos/)
  })
})

describe('D22: o "Estoque crítico" do dashboard da rede diz o que cada linha é, e quantas são', () => {
  it('a página manda o total de linhas, antes do corte das 20', () => {
    const p = fonte('app/admin/dashboard/page.tsx')
    expect(p).toMatch(/totalDoEstoqueCritico\s*=\s*linhasDoEstoqueCritico\.length/)
    expect(p).toMatch(/totalDoEstoqueCritico=\{totalDoEstoqueCritico\}/)
  })
  it('o número da lista é o total, e a dica diz que cada linha é um produto numa unidade', () => {
    const v = fonte('components/admin/admin-dashboard-view.tsx')
    const lista = v.slice(v.indexOf('{/* Estoque crítico */}'))
    expect(lista).toMatch(/\{totalDoEstoqueCritico\}/)
    expect(lista).toMatch(/<Dica rotulo="O que a lista conta"/)
    expect(lista).toMatch(/um produto numa unidade/)
    expect(lista).toMatch(/\+\{totalDoEstoqueCritico - 5\} mais/)
  })
})
