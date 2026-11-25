import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EntradaDasRegras, EntradaDaComissaoDoProcedimento, EntradaDaComissaoDoPacote, EntradaDaComissaoDoProduto,
  EntradaDasTaxas, LIMITE_DA_COMISSAO_FIXA, recusaDoValorDaComissao,
} from '@/lib/comissoes/config'

/**
 * O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
 * feito." A comissão em valor fixo ia até R$ 1.000.000, com a mensagem do zod
 * em inglês — e o R$ 1.000.000 em si passava na tela e quebrava no banco.
 *
 * O impossível (decisão do Claude, 25/11) é o REGISTRO: a regra grava em
 * `commission_rules.value` (numeric(10,4)) e cada lançamento a copia em
 * `commissions.rule_value` (numeric(10,4)) — o pacote, o responsável e o
 * produto também passam por ali. O maior que cabe, em centavos, é
 * R$ 999.999,99: o antigo teto (R$ 1.000.000) já era o limite do registro, e
 * não sobra "comum" para avisar. O percentual acima de 100% continua recusado.
 *
 * As listas: as exceções (uma por procedimento) e os valores por profissional
 * (um por pessoa) crescem com a rede — não têm teto. As taxas não passam do
 * número de combinações (Pix, débito e crédito de 1x a 1.200x), e o que passa
 * dele é repetido.
 */

const APP = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(APP, p), 'utf8')
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const mensagem = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.success ? '' : r.error!.issues[0]!.message
const NO_MAXIMO = 'No máximo R$ 999.999,99 (o limite do registro).'

describe('a comissão em valor fixo: até o limite do registro', () => {
  it('o limite é R$ 999.999,99 (numeric(10,4) na regra e no lançamento)', () => {
    expect(LIMITE_DA_COMISSAO_FIXA).toBe(999_999.99)
    expect(recusaDoValorDaComissao('FIXED_AMOUNT', 999_999.99)).toBeNull()
    expect(recusaDoValorDaComissao('FIXED_AMOUNT', 1_000_000)).toBe(NO_MAXIMO)
    expect(recusaDoValorDaComissao('PERCENTAGE', 100)).toBeNull()
    expect(recusaDoValorDaComissao('PERCENTAGE', 100.01)).toBe('Percentual acima de 100%.')
    expect(recusaDoValorDaComissao('FIXED_AMOUNT', -1)).toBe('A comissão não pode ser negativa.')
    expect(recusaDoValorDaComissao('FIXED_AMOUNT', Number.NaN)).toBe('Informe o valor da comissão.')
  })

  it('o padrão e a exceção do profissional', () => {
    expect(EntradaDasRegras.safeParse({ padrao: { tipo: 'FIXED_AMOUNT', valor: 999_999.99 }, excecoes: [] }).success).toBe(true)
    const r = EntradaDasRegras.safeParse({ padrao: { tipo: 'FIXED_AMOUNT', valor: 1_000_000 }, excecoes: [] })
    expect(mensagem(r)).toBe(NO_MAXIMO)
    const e = EntradaDasRegras.safeParse({ padrao: null, excecoes: [{ procedure_id: uuid(1), tipo: 'FIXED_AMOUNT', valor: 2_000_000 }] })
    expect(mensagem(e)).toBe(NO_MAXIMO)
  })

  it('a comissão do procedimento (a geral e a de cada profissional)', () => {
    expect(mensagem(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'GERAL', geral: { tipo: 'FIXED_AMOUNT', valor: 1_000_000 } }))).toBe(NO_MAXIMO)
    expect(mensagem(EntradaDaComissaoDoProcedimento.safeParse({
      modo: 'POR_PROFISSIONAL', profissionais: [{ professional_id: uuid(1), tipo: 'FIXED_AMOUNT', valor: 1_000_000 }],
    }))).toBe(NO_MAXIMO)
  })

  it('a comissão do pacote (a de venda, a da sessão e a do responsável)', () => {
    expect(mensagem(EntradaDaComissaoDoPacote.safeParse({ venda: { tipo: 'FIXED_AMOUNT', valor: 1_000_000 }, execucao: { tipo: 'REGRA' } }))).toBe(NO_MAXIMO)
    expect(mensagem(EntradaDaComissaoDoPacote.safeParse({ venda: null, execucao: { tipo: 'FIXED_AMOUNT', valor: 1_000_000 } }))).toBe(NO_MAXIMO)
    expect(mensagem(EntradaDaComissaoDoPacote.safeParse({ venda: null, execucao: { tipo: 'PACOTE', valorTipo: 'FIXED_AMOUNT', valor: 1_000_000 } }))).toBe(NO_MAXIMO)
    expect(EntradaDaComissaoDoPacote.safeParse({ venda: { tipo: 'FIXED_AMOUNT', valor: 999_999.99 }, execucao: { tipo: 'FIXED_AMOUNT', valor: 999_999.99 } }).success).toBe(true)
  })

  it('a comissão do produto, por unidade', () => {
    expect(mensagem(EntradaDaComissaoDoProduto.safeParse({ tipo: 'FIXED_AMOUNT', valor: 1_000_000 }))).toBe(NO_MAXIMO)
    expect(EntradaDaComissaoDoProduto.safeParse({ tipo: 'FIXED_AMOUNT', valor: 999_999.99 }).success).toBe(true)
  })

  it('as mensagens em português: negativo, sem número, tipo e id', () => {
    expect(mensagem(EntradaDasRegras.safeParse({ padrao: { tipo: 'FIXED_AMOUNT', valor: -5 }, excecoes: [] }))).toBe('A comissão não pode ser negativa.')
    expect(mensagem(EntradaDasRegras.safeParse({ padrao: { tipo: 'FIXED_AMOUNT', valor: 'dez' }, excecoes: [] }))).toBe('Informe o valor da comissão.')
    expect(mensagem(EntradaDasRegras.safeParse({ padrao: { tipo: 'OUTRO', valor: 5 }, excecoes: [] }))).toBe('Escolha se a comissão é em % ou em R$.')
    expect(mensagem(EntradaDasRegras.safeParse({ padrao: null, excecoes: [{ procedure_id: 'x', tipo: 'PERCENTAGE', valor: 5 }] }))).toBe('Procedimento não encontrado.')
    expect(mensagem(EntradaDaComissaoDoProcedimento.safeParse({
      modo: 'POR_PROFISSIONAL', profissionais: [{ professional_id: 'x', tipo: 'PERCENTAGE', valor: 5 }],
    }))).toBe('Profissional não encontrado.')
    expect(mensagem(EntradaDaComissaoDoProduto.safeParse({ tipo: 'FIXED_AMOUNT', valor: 'dez' }))).toBe('Informe o valor da comissão.')
  })
})

describe('as listas da comissão: sem teto onde a rede cresce', () => {
  it('mais de 200 exceções (uma por procedimento) passam', () => {
    const excecoes = Array.from({ length: 250 }, (_, i) => ({ procedure_id: uuid(i + 1), tipo: 'PERCENTAGE', valor: 10 }))
    expect(EntradaDasRegras.safeParse({ padrao: null, excecoes }).success).toBe(true)
  })
  it('mais de 500 profissionais no procedimento passam', () => {
    const profissionais = Array.from({ length: 600 }, (_, i) => ({ professional_id: uuid(i + 1), tipo: 'PERCENTAGE', valor: 10 }))
    expect(EntradaDaComissaoDoProcedimento.safeParse({ modo: 'POR_PROFISSIONAL', profissionais }).success).toBe(true)
  })
  it('as taxas: além das combinações possíveis, a lista tem repetida — e diz isso em português', () => {
    const muitas = Array.from({ length: 1203 }, (_, i) => ({ metodo: 'CREDIT_CARD', parcelas: (i % 1200) + 1, taxa_pct: 1 }))
    expect(mensagem(EntradaDasTaxas.safeParse(muitas))).toBe('Há taxa repetida para o mesmo meio e parcelas.')
  })
})

describe('as telas da comissão recusam o mesmo que o servidor', () => {
  it('a da pessoa (Equipe) e a do procedimento leem recusaDoValorDaComissao', () => {
    expect(ler('components/admin/comissao-do-membro.tsx')).toMatch(/recusaDoValorDaComissao\(/)
    expect(ler('components/admin/comissao-do-procedimento.tsx')).toMatch(/recusaDoValorDaComissao\(/)
    expect(ler('components/branch/comissao-do-produto.tsx')).toMatch(/recusaDoValorDaComissao\(/)
  })
  it('o config não tem mais o teto de R$ 1.000.000 nem os das listas', () => {
    const config = ler('lib/comissoes/config.ts')
    expect(config).not.toMatch(/1_000_000/)
    expect(config).not.toMatch(/\.max\(200\)/)
    expect(config).not.toMatch(/\.max\(500\)/)
  })
})
