import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A comanda do atendimento sem o teto de quantidade dos produtos (o Heitor, 25/11: "Se não for impossível,
 * ainda que improvável, pode ser feito.") pode passar do que o registro guarda: cada lançamento vai em
 * `financial_transactions.amount` (numeric(10,2)) e a venda dos produtos em `preco_tabela` (numeric(12,2)).
 * O banco recusaria em inglês ("numeric field overflow"); o receber recusa antes, em português — a mesma
 * regra da venda de produto e do pré-pago (`recusaDoValorDaVenda`, lib/vendas/quantidades.ts).
 */
const fonte = readFileSync(join(__dirname, '..', 'actions', 'appointments.ts'), 'utf8')

describe('o receber da comanda recusa o valor que o registro não guarda', () => {
  it('confere os lançamentos e a venda dos produtos antes de gravar', () => {
    const conferencia = fonte.indexOf('recusaDoValorDaVenda(itens, lancamentos.map(')
    const gravacao = fonte.indexOf("admin.rpc('confirmar_pagamento_do_atendimento'")
    expect(conferencia, 'a conferência existe').toBeGreaterThan(-1)
    expect(conferencia, 'antes da gravação').toBeLessThan(gravacao)
  })
})
