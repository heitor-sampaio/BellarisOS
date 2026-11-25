import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  recusaDaQuantidadeDoProduto, avisoDaQuantidadeDoProduto,
  recusaDosItensDaVenda, avisosDosItensDaVenda,
  recusaDasSessoesDoPrePago, avisoDasSessoesDoPrePago,
  recusaDaQuantidadeQueVolta, recusaDoValorDaVenda,
} from '@/lib/vendas/quantidades'

/**
 * O Heitor, 25/11, sobre os limites que recusavam o valor que a rede escolheu:
 * "Se não for impossível, ainda que improvável, pode ser feito."
 *
 * Recusava-se: na venda de produto, mais de 100 de cada produto, mais de 100
 * unidades e mais de 20 produtos; na comanda do PDV, mais de 100 de cada e mais
 * de 20 produtos; no pré-pago, mais de 100 sessões; na devolução, mais de 100
 * de cada e mais de 20 linhas.
 *
 * Decisão do Claude, 25/11: o "comum" é o antigo teto — acima dele a tela avisa
 * e o servidor grava. O impossível: zero, fracionário e acima do registro (a
 * quantidade é `integer` no banco; o pré-pago grava UMA LINHA POR SESSÃO, então
 * até 32.767, como o crediário). O número de produtos não tem limite próprio:
 * cada produto entra uma vez (somado). O valor que passa do que o lançamento
 * guarda (numeric(10,2)) se recusa em português, não estoura no banco.
 */

const APP = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(APP, p), 'utf8')

describe('a quantidade de cada produto (venda e comanda): acima de 100 avisa', () => {
  it('grava 150 com o aviso; 100 não avisa', () => {
    expect(recusaDaQuantidadeDoProduto(150)).toBeNull()
    expect(avisoDaQuantidadeDoProduto(150)).toBe('Acima do comum (mais de 100 unidades). Confira: o valor vale como está.')
    expect(avisoDaQuantidadeDoProduto(100)).toBeNull()
  })
  it('o impossível: zero, negativo, fracionário e acima do registro', () => {
    for (const q of [0, -1, 1.5, Number.NaN]) {
      expect(recusaDaQuantidadeDoProduto(q), String(q)).toBe('Quantidade inválida: um número inteiro, a partir de 1.')
    }
    expect(recusaDaQuantidadeDoProduto(2_147_483_647)).toBeNull()
    expect(recusaDaQuantidadeDoProduto(2_147_483_648)).toBe('No máximo 2.147.483.647 unidades de cada produto (o limite do registro).')
  })
})

describe('a venda de produto: acima de 100 unidades e de 20 produtos avisa', () => {
  it('25 produtos e 300 unidades se gravam, com os dois avisos', () => {
    const qtds = Array.from({ length: 25 }, () => 12)
    expect(recusaDosItensDaVenda(qtds)).toBeNull()
    expect(avisosDosItensDaVenda(qtds)).toEqual({
      unidades: 'Acima do comum (mais de 100 unidades na venda). Confira: o valor vale como está.',
      produtos: 'Acima do comum (mais de 20 produtos). Confira: o valor vale como está.',
    })
    expect(avisosDosItensDaVenda([60, 40])).toEqual({ unidades: null, produtos: null })
  })
  it('recusa a venda vazia, a quantidade impossível e o total acima do registro', () => {
    expect(recusaDosItensDaVenda([])).toBe('Escolha ao menos um produto.')
    expect(recusaDosItensDaVenda([2, 0])).toBe('Quantidade inválida: um número inteiro, a partir de 1.')
    expect(recusaDosItensDaVenda([2_000_000_000, 2_000_000_000])).toBe('No máximo 2.147.483.647 unidades numa venda (o limite do registro).')
  })
})

describe('o pré-pago: acima de 100 sessões avisa', () => {
  it('grava 150 sessões com o aviso', () => {
    expect(recusaDasSessoesDoPrePago(150)).toBeNull()
    expect(avisoDasSessoesDoPrePago(150)).toBe('Acima do comum (mais de 100 sessões). Confira: o valor vale como está.')
    expect(avisoDasSessoesDoPrePago(100)).toBeNull()
  })
  it('o impossível: zero, fracionário e acima de 32.767 (uma linha por sessão)', () => {
    expect(recusaDasSessoesDoPrePago(0)).toBe('Quantidade inválida: um número inteiro de sessões, a partir de 1.')
    expect(recusaDasSessoesDoPrePago(2.5)).toBe('Quantidade inválida: um número inteiro de sessões, a partir de 1.')
    expect(recusaDasSessoesDoPrePago(32_767)).toBeNull()
    expect(recusaDasSessoesDoPrePago(32_768)).toBe('No máximo 32.767 sessões (o limite do registro).')
  })
})

describe('a devolução segue a venda', () => {
  it('quantas voltam: de 0 ao registro; o que passa do vendido o banco recusa', () => {
    expect(recusaDaQuantidadeQueVolta(0)).toBeNull()
    expect(recusaDaQuantidadeQueVolta(150)).toBeNull()
    expect(recusaDaQuantidadeQueVolta(-1)).toBe('Diga quantas unidades de cada produto voltam.')
    expect(recusaDaQuantidadeQueVolta(1.5)).toBe('Diga quantas unidades de cada produto voltam.')
    expect(recusaDaQuantidadeQueVolta(2_147_483_648)).toBe('No máximo 2.147.483.647 unidades de cada produto (o limite do registro).')
  })
})

describe('o valor da venda que o registro não guarda se recusa em português', () => {
  it('cada pagamento até R$ 99.999.999,99 e a venda até R$ 9.999.999.999,99', () => {
    expect(recusaDoValorDaVenda(150_000_000, [50_000_000, 50_000_000, 50_000_000])).toBeNull()
    expect(recusaDoValorDaVenda(100_000_000, [100_000_000])).toBe('No máximo 99.999.999,99 reais num pagamento (o limite do registro).')
    expect(recusaDoValorDaVenda(10_000_000_000, [1])).toBe('No máximo 9.999.999.999,99 reais numa venda (o limite do registro).')
  })
})

describe('as actions usam a mesma regra, sem os tetos de antes', () => {
  it('a venda de produto', () => {
    const src = ler('actions/produtos.ts')
    expect(src).toMatch(/recusaDosItensDaVenda\(/)
    expect(src).toMatch(/recusaDoValorDaVenda\(/)
    expect(src).not.toMatch(/até 20 produtos|até 100 unidades|de 1 a 100|> 100\b|> 20\b/)
  })
  it('a comanda do PDV', () => {
    const src = ler('actions/pdv.ts')
    expect(src).toMatch(/recusaDaQuantidadeDoProduto\(/)
    expect(src).not.toMatch(/de 1 a 100|qtd > 100/)
  })
  it('o pré-pago, e as vezes do cartão pela constante', () => {
    const src = ler('actions/pre-pago.ts')
    expect(src).toMatch(/recusaDasSessoesDoPrePago\(/)
    expect(src).toMatch(/recusaDoValorDaVenda\(/)
    expect(src).not.toMatch(/de 1 a 100|qtd > 100|1_200/)
    expect(src).toMatch(/\.max\(LIMITE_DE_VEZES_NO_CARTAO/)
  })
  it('a devolução', () => {
    const src = ler('actions/devolucao-de-produto.ts')
    expect(src).toMatch(/recusaDaQuantidadeQueVolta|LIMITE_DA_QUANTIDADE/)
    expect(src).not.toMatch(/\.max\(100\)|\.max\(20\)/)
  })
})

describe('as telas não param no teto de antes e mostram o aviso', () => {
  it('a Nova venda: produto e pré-pago', () => {
    const src = ler('components/shared/vender.tsx')
    expect(src).not.toMatch(/max=\{100\}/)
    expect(src).not.toMatch(/itens\.length < 20/)
    expect(src).not.toMatch(/qtd > 100|l\.qtd <= 100/)
    expect(src).toMatch(/avisoDaQuantidadeDoProduto\(/)
    expect(src).toMatch(/avisosDosItensDaVenda\(/)
    expect(src).toMatch(/avisoDasSessoesDoPrePago\(/)
    expect(src).toMatch(/data-acima-do-comum="quantidade-do-produto"/)
    expect(src).toMatch(/data-acima-do-comum="sessoes-do-pre-pago"/)
  })
  it('a comanda do PDV', () => {
    const src = ler('components/shared/pdv/produtos-da-comanda.tsx')
    expect(src).not.toMatch(/max=\{100\}|qtd > 100|de 1 a 100/)
    expect(src).toMatch(/avisoDaQuantidadeDoProduto\(/)
    expect(src).toMatch(/data-acima-do-comum="quantidade-do-produto"/)
  })
})

describe('o banco: os CHECKs e as funções deixam o teto de antes', () => {
  const pasta = join(APP, '..', '..', 'supabase', 'migrations')
  const nome = readdirSync(pasta).find(n => n.startsWith('20261207200001'))
  it('a migration nova', () => {
    expect(nome, 'a migration nova').toBeTruthy()
    const sql = readFileSync(join(pasta, nome!), 'utf8')
    for (const c of ['product_sales_quantity_check', 'product_sale_items_quantity_check', 'comanda_itens_quantidade_check', 'procedure_sales_quantity_check']) {
      expect(sql, c).toContain(c)
    }
    for (const f of ['public.produto_vender_itens', 'public.produto_vender', 'public.comanda_acrescentar_item', 'public.procedimento_vender', 'public.procedimento_vender_com_equipe']) {
      expect(sql, f).toContain(f)
    }
    expect(sql).toContain('quantity between 1 and 32767')
    expect(sql).toContain('p_quantidade > 32767')
    expect(sql).not.toMatch(/between 1 and 100\b/)
    expect(sql.trimEnd().endsWith(`notify pgrst, 'reload schema';`)).toBe(true)
  })
})
