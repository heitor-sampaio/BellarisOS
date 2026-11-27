import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatBRL } from '@estetica-os/utils'

/**
 * CR-07 (`docs/regras/vendas-financeiro.md`, "As formas da mesma parcela são
 * UMA linha nas listas"): no app da cliente, o Financeiro e o Histórico →
 * Pagamentos mostravam a parcela paga em duas formas em duas linhas — as
 * páginas usavam só `formaDoLancamento`, sem a junção da equipe
 * (`juntarAsFormasDaParcela`). A linha junta é uma; o recibo segue por forma.
 */
const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('a parcela paga em duas formas, no app da cliente', () => {
  const base = { type: 'INCOME', is_paid: true, notes: null, category: 'Crediário', description: 'Limpeza — parcela 1/2', parcela_numero: 1, parcela_total: 2, created_at: '2026-11-27T12:00:00Z', paid_at: '2026-11-27T15:00:00Z', cartao_vezes: null }

  it('a forma da linha junta é o texto das formas, e cada forma tem o seu recibo', async () => {
    const { juntarAsFormasDaParcela, formaERecibosDaLinha } = await import('@/lib/financeiro/formas-da-parcela')
    const [junta] = juntarAsFormasDaParcela([
      { ...base, id: 'a', amount: 100, payment_method: 'PIX' },
      { ...base, id: 'b', amount: 50, payment_method: 'CASH' },
    ])
    expect(formaERecibosDaLinha(junta!, 'Pix')).toEqual({
      forma: `Pix ${formatBRL(100)} + Dinheiro ${formatBRL(50)}`,
      recibos: [{ id: 'a', forma: 'Pix' }, { id: 'b', forma: 'Dinheiro' }],
    })
  })

  // As cópias de uma parcela nascem com a mesma criação (`lancamento_receber_em_formas`): a ordem de leitura empata, e
  // a mesma parcela saía "Dinheiro + Pix" numa leitura e "Pix + Dinheiro" noutra. A ordem é a do valor, a maior primeiro.
  it('as formas vêm na ordem do valor, a maior primeiro, qualquer que seja a ordem lida', async () => {
    const { juntarAsFormasDaParcela, formasDaParcelaEmTexto } = await import('@/lib/financeiro/formas-da-parcela')
    const [junta] = juntarAsFormasDaParcela([
      { ...base, id: 'b', amount: 200, payment_method: 'CASH' },
      { ...base, id: 'a', amount: 400, payment_method: 'PIX' },
    ])
    expect(formasDaParcelaEmTexto(junta!.formasDaParcela!)).toBe(`Pix ${formatBRL(400)} + Dinheiro ${formatBRL(200)}`)
    expect(junta!.amount).toBe(600)
  })

  it('a linha de uma forma só segue com a forma dela e um recibo', async () => {
    const { juntarAsFormasDaParcela, formaERecibosDaLinha } = await import('@/lib/financeiro/formas-da-parcela')
    const [sozinha] = juntarAsFormasDaParcela([{ ...base, id: 'c', amount: 150, payment_method: 'PIX' }])
    expect(formaERecibosDaLinha(sozinha!, 'Pix')).toEqual({ forma: 'Pix', recibos: [{ id: 'c', forma: null }] })
  })

  it('o Financeiro e o Histórico do app juntam as formas, e o recibo é por forma', () => {
    for (const pagina of ['app/[slug]/cliente/financeiro/page.tsx', 'app/[slug]/cliente/historico/page.tsx']) {
      const fonte = ler(pagina)
      expect(fonte, pagina).toContain('juntarAsFormasDaParcela(')
      expect(fonte, pagina).toContain('formaERecibosDaLinha(')
    }
    expect(ler('app/[slug]/cliente/financeiro/page.tsx')).toContain('r.recibos.map(')
    expect(ler('components/client-portal/historico-tabs.tsx')).toContain('recibos')
  })
})
