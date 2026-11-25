import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recusaDaVendaNaUnidade, RECUSA_DA_VENDA_NA_DESATIVADA } from '@/lib/vendas/unidade-da-venda'

/**
 * A unidade desativada não vende (plataforma:UN-14, "para criar, só as
 * unidades ativas: os seletores … de vender"; docs/regras/plataforma.md, "para
 * CRIAR"). O PDV dela segue aberto para receber o que ficou (UN-13), sem a
 * "Nova venda"; e as actions de venda recusam — a trava da action é a única
 * (CLAUDE.md §11): sem ela, a venda pelo id da unidade gravava na desativada.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')

/** O corpo da função `nome` (até a próxima função de topo). */
function corpoDe(texto: string, nome: string): string {
  const i = texto.search(new RegExp(`(async )?function ${nome}\\(`))
  expect(i, `a função ${nome}`).toBeGreaterThanOrEqual(0)
  const resto = texto.slice(i + 10)
  const fim = resto.search(/\n(export )?(async )?function /)
  return fim < 0 ? resto : resto.slice(0, fim)
}

describe('a recusa da venda na unidade desativada', () => {
  it('desativada, a frase; ativa, nada', () => {
    expect(recusaDaVendaNaUnidade({ is_active: false })).toBe(RECUSA_DA_VENDA_NA_DESATIVADA)
    expect(recusaDaVendaNaUnidade({ is_active: true })).toBeNull()
    expect(recusaDaVendaNaUnidade(null)).toBeNull()
    expect(RECUSA_DA_VENDA_NA_DESATIVADA).toMatch(/desativada/)
  })
})

describe('as quatro actions de venda recusam a unidade desativada', () => {
  const vendas: [string, string][] = [
    ['actions/pacotes.ts', 'venderPacoteUmaVez'],
    ['actions/pre-pago.ts', 'venderProcedimentoUmaVez'],
    ['actions/produtos.ts', 'venderProdutoUmaVez'],
    ['actions/credito-interno.ts', 'venderUmaVez'],
  ]
  for (const [arquivo, funcao] of vendas) {
    it(`${arquivo} (${funcao}) lê a unidade com is_active e recusa a desativada`, () => {
      const texto = ler(arquivo)
      expect(texto).toContain("from '@/lib/vendas/unidade-da-venda'")
      const corpo = corpoDe(texto, funcao)
      expect(corpo).toMatch(/from\('branches'\)\.select\('id, is_active'\)/)
      expect(corpo).toMatch(/recusaDaVendaNaUnidade\(unidade\)/)
    })
  }
})

describe('o PDV da unidade desativada não oferece a "Nova venda"', () => {
  it('o corpo do PDV sabe se a unidade vende, e não abre a venda nela', () => {
    const pdv = ler('app/_shared/pdv.tsx')
    expect(pdv).toMatch(/const vende = unidades\.find\(u => u\.id === unidadeId\)\?\.ativa !== false/)
    expect(pdv).toMatch(/nova === '1' && !vende/)
    expect(pdv).toMatch(/vende=\{vende\}/)
  })
  it('a tela esconde o botão e diz por quê; a pergunta "Em qual unidade?" só lista as ativas', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).toMatch(/\{vende && \(\s*<Link href=\{href\(\{ nova: '1' \}\)\}/)
    expect(tela).toContain('data-unidade-nao-vende')
    expect(tela).toMatch(/unidades\.filter\(u => u\.ativa !== false\)\.map\(u => \(\{ \.\.\.u, href: hrefNaUnidade\(u\.id\) \}\)\)/)
  })
  it('as duas páginas do PDV dizem ao corpo se a unidade está ativa', () => {
    expect(ler('app/admin/pdv/page.tsx')).toMatch(/ativa: u\.ativa/)
    const daUnidade = ler('app/[slug]/pdv/page.tsx')
    expect(daUnidade).toMatch(/select\('id, name, is_active'\)/)
    expect(daUnidade).toMatch(/ativa: unidade\.is_active !== false/)
  })
})
