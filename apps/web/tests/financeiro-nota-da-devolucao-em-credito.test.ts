import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { notaDoPagamentoQueVoltou, notaDoPagamentoQueVoltouParaACliente } from '@/lib/financeiro/notas-do-lancamento'
import { creditoDasDevolucoesPorVenda, creditoPorLancamento } from '@/lib/financeiro/devolucao-em-credito'

/**
 * EX-11 ("A linha do lançamento diz o que aconteceu… e o app diz o mesmo") e
 * PR-08: a devolução de parte da venda que virou CRÉDITO INTERNO deixa o
 * pagamento como estava (o dinheiro fica no caixa) e dá o valor à cliente
 * como crédito. A linha dizia só "R$ 180,00", sem a parte que virou crédito.
 * O texto: decisão do Claude, 28/11, no estilo da EX-11.
 */
const pago = { type: 'INCOME', amount: 180, is_paid: true }

describe('a linha do pagamento diz a parte que virou crédito interno', () => {
  it('nos Financeiros da equipe', () => {
    expect(notaDoPagamentoQueVoltou(pago, 90)).toMatch(/^Pago R\$\s180,00 · R\$\s90,00 em crédito interno$/)
  })
  it('junto do estorno parcial, as duas partes', () => {
    expect(notaDoPagamentoQueVoltou({ ...pago, amount: 110, valor_antes_do_estorno: 1100 }, 50))
      .toMatch(/^Pago R\$\s1\.100,00 · R\$\s990,00 estornados · R\$\s50,00 em crédito interno$/)
  })
  it('só o estorno parcial: o texto de sempre (A36)', () => {
    expect(notaDoPagamentoQueVoltou({ ...pago, amount: 110, valor_antes_do_estorno: 1100 }, 0))
      .toMatch(/^Pago R\$\s1\.100,00 · R\$\s990,00 estornados$/)
  })
  it('nada voltou, ou o pagamento foi estornado: nada', () => {
    expect(notaDoPagamentoQueVoltou(pago, 0)).toBeNull()
    expect(notaDoPagamentoQueVoltou({ ...pago, notes: 'Estornada' }, 90)).toBeNull()
  })
  it('no app, com o nome do crédito da CI-10', () => {
    expect(notaDoPagamentoQueVoltouParaACliente(pago, 90, 'Crédito em Ateliê Cupuaçu'))
      .toMatch(/^R\$\s180,00 pagos · R\$\s90,00 voltaram como Crédito em Ateliê Cupuaçu$/)
  })
})

describe('quanto de cada pagamento virou crédito', () => {
  it('cada devolução conta uma vez (a função grava o retrato em cada item devolvido)', () => {
    const porVenda = creditoDasDevolucoesPorVenda([
      { sale_id: 'v1', created_at: '2026-11-28T02:19:00Z', retrato: { destino: 'CREDITO', devolver: 90 } },
      { sale_id: 'v1', created_at: '2026-11-28T02:19:00Z', retrato: { destino: 'CREDITO', devolver: 90 } },
      { sale_id: 'v1', created_at: '2026-11-28T03:00:00Z', retrato: { destino: 'ESTORNO', devolver: 40 } },
      { sale_id: 'v2', created_at: '2026-11-28T04:00:00Z', retrato: { destino: 'CREDITO', devolver: '30.5' } },
    ])
    expect(porVenda.get('v1')).toBe(90)
    expect(porVenda.get('v2')).toBe(30.5)
  })
  it('vai do pagamento mais recente da venda para trás, até o valor de cada um', () => {
    const r = creditoPorLancamento([
      { id: 'a', product_sale_id: 'v1', type: 'INCOME', is_paid: true, amount: 50, paid_at: '2026-11-27T10:00:00Z', created_at: '2026-11-27T10:00:00Z' },
      { id: 'b', product_sale_id: 'v1', type: 'INCOME', is_paid: true, amount: 60, paid_at: '2026-11-28T10:00:00Z', created_at: '2026-11-28T10:00:00Z' },
      { id: 'c', product_sale_id: 'v1', type: 'INCOME', is_paid: true, amount: 99, notes: 'Estornada', paid_at: '2026-11-29T10:00:00Z', created_at: '2026-11-29T10:00:00Z' },
    ], new Map([['v1', 90]]))
    expect(r).toEqual({ b: 60, a: 30 })
  })
})

describe('as telas usam a nota', () => {
  const WEB = join(__dirname, '..')
  const ler = (c: string) => readFileSync(join(WEB, c), 'utf8')
  it('os dois Financeiros e o app (Financeiro e Histórico)', () => {
    expect(ler('app/[slug]/financeiro/page.tsx')).toContain('notaDoPagamentoQueVoltou(')
    expect(ler('app/admin/financeiro/page.tsx')).toContain('notaDoPagamentoQueVoltou(')
    expect(ler('app/[slug]/cliente/financeiro/page.tsx')).toContain('notaDoPagamentoQueVoltouParaACliente(')
    expect(ler('app/[slug]/cliente/historico/page.tsx')).toContain('notaDoPagamentoQueVoltouParaACliente(')
    expect(ler('components/client-portal/historico-tabs.tsx')).toContain('data-devolvido-em-parte')
  })
})
