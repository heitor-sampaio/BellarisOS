import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * R04 (o Heitor, 26/11, na página de perguntas): "O link só para quem tem o
 * Estoque em Gerenciar; o aviso da falta para todos (a proposta)" — e "e tb
 * não deixa realizar a venda de produto sem estoque". Todo caminho que vende
 * produto: a tela não deixa, e o servidor recusa.
 */
const WEB = path.join(__dirname, '..')
const fonte = (...p: string[]) => fs.readFileSync(path.join(WEB, ...p), 'utf8')

describe('R04: o "Dar entrada no Estoque" da venda sem estoque', () => {
  it('só aparece para quem tem o Estoque em Gerenciar; o aviso da falta fica para todos', () => {
    const tela = fonte('components', 'shared', 'vender.tsx')
    // O link mora dentro da condição da permissão; o aviso, não.
    expect(tela).toMatch(/\{podeDarEntradaNoEstoque && \(\s*<Link[^>]*>Dar entrada no Estoque<\/Link>/)
    expect(tela).toMatch(/\{falta && \(\s*<p data-falta-de-estoque/)
  })
  it('a permissão vem do servidor, pelo Estoque em Gerenciar', () => {
    expect(fonte('app', '_shared', 'pdv.tsx')).toContain("podeDarEntradaNoEstoque: can(ctx, 'stock', 'MANAGE')")
    expect(fonte('components', 'shared', 'pdv', 'nova-venda.tsx')).toContain('podeDarEntradaNoEstoque={venda.podeDarEntradaNoEstoque}')
  })
})

describe('R04: o produto na comanda do atendimento não passa do estoque', () => {
  it('acrescentar mais do que há (somando o que já está na comanda) diz a falta', async () => {
    const { faltaAoAcrescentarNaComanda } = await import('@/lib/vendas/falta-de-estoque')
    const serum = { id: 'p1', name: 'Sérum', unidade: 'un', disponivel: 3 }
    expect(faltaAoAcrescentarNaComanda(serum, 2, 0)).toBeNull()
    expect(faltaAoAcrescentarNaComanda(serum, 2, 1)).toBeNull()
    expect(faltaAoAcrescentarNaComanda(serum, 2, 2)).toBe('Só há 3 un de Sérum nesta unidade.')
    expect(faltaAoAcrescentarNaComanda({ ...serum, disponivel: 0 }, 1, 0)).toBe('Sem estoque de Sérum nesta unidade.')
    expect(faltaAoAcrescentarNaComanda(null, 1, 0)).toBeNull()
  })
  it('o que está na comanda e passou do estoque (o saldo caiu depois) diz a falta; o vendido não conta', async () => {
    const { faltaDosProdutosDaComanda } = await import('@/lib/vendas/falta-de-estoque')
    const produtos = [{ id: 'p1', name: 'Sérum', unidade: 'un', disponivel: 1 }, { id: 'p2', name: 'Protetor', unidade: 'un', disponivel: 5 }]
    const item = (produtoId: string, nome: string, quantidade: number, vendido = false) => ({ produtoId, nome, unidade: 'un', quantidade, vendido })
    expect(faltaDosProdutosDaComanda([item('p1', 'Sérum', 1), item('p2', 'Protetor', 5)], produtos)).toBeNull()
    expect(faltaDosProdutosDaComanda([item('p1', 'Sérum', 2), item('p2', 'Protetor', 1)], produtos)).toBe('Só há 1 un de Sérum nesta unidade.')
    expect(faltaDosProdutosDaComanda([item('p1', 'Sérum', 4, true)], produtos)).toBeNull()
    // O produto que já não está à venda (fora da lista) o servidor confere.
    expect(faltaDosProdutosDaComanda([item('p9', 'Outro', 4)], produtos)).toBeNull()
  })
  it('a comanda desliga o "Acrescentar" e o "+" no limite, e o Receber com a falta, cada um com o motivo', () => {
    const comanda = fonte('components', 'shared', 'pdv', 'produtos-da-comanda.tsx')
    expect(comanda).toContain('faltaAoAcrescentarNaComanda(')
    expect(comanda).toContain('faltaDosProdutosDaComanda(')
    expect(comanda).toMatch(/disabled=\{pendente \|\| !!faltaDoAcrescentar\}/)
    expect(comanda).toMatch(/disabled=\{pendente \|\| noLimite\(i\)\}/)
    const pdv = fonte('components', 'shared', 'pdv', 'pdv-tela.tsx')
    expect(pdv).toContain('faltaDeEstoque={faltaDosProdutosDaComanda(')
    const receber = fonte('components', 'shared', 'receber-atendimento.tsx')
    expect(receber).toMatch(/disabled=\{pending \|\| !!faltaDeEstoque \|\|/)
    expect(receber).toContain('motivoDaFaltaNoBotao(faltaDeEstoque)')
  })
})
