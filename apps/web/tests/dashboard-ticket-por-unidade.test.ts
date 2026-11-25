import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D15 da 28ª: a coluna "Ticket médio" do ranking de unidades mostrava R$ 253,33
 * sem a conta — lida como receita ÷ atendimentos (760 ÷ 2), e é 760 ÷ 3 clientes
 * que pagaram. TM-02 (a conta, também na coluna por unidade) e design.md ("A
 * explicação mora na dica", 16/11): a conta vai na dica do cabeçalho, e cada
 * linha leva o número de clientes que pagaram dela.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('a coluna Ticket médio por unidade diz a conta', () => {
  it('a página manda as clientes que pagaram de cada unidade', () => {
    expect(fonte('app/admin/dashboard/page.tsx')).toMatch(/clientesQuePagaram: ticket\?\.porUnidade\[b\.branchId\]\?\.clientesQuePagaram \?\? 0/)
  })
  it('o cabeçalho tem a dica com a conta, e a célula a conta da unidade', () => {
    const v = fonte('components/admin/admin-dashboard-view.tsx')
    expect(v).toContain('data-conta-do-ticket-por-unidade')
    expect(v).toMatch(/<Dica rotulo="Sobre: Ticket médio por unidade">/)
    expect(v).toMatch(/Pago pelas clientes ÷ as clientes que pagaram/)
    expect(v).toMatch(/b\.clientesQuePagaram === 1 \? 'cliente que pagou' : 'clientes que pagaram'/)
  })
})
