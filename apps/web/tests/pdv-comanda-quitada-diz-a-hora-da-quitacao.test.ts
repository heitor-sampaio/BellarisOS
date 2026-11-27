import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A2 da 38ª simulação (princípio 3): a comanda do crediário — entrada às 10:43
 * e duas parcelas — quitada na 2/2 seguia dizendo "Paga às 10:43", a hora da
 * entrada. Enquanto há dinheiro em aberto ela é "Fechada às 10:43" (A9 da
 * 30ª); quitada, "Paga" é na hora do ÚLTIMO pagamento. `pdv_comandas` dá a
 * hora em que as linhas nasceram (o fechamento): a parcela recebida depois
 * guarda a dela em `paid_at`.
 */
const raiz = join(__dirname, '..')
const fonte = (a: string) => readFileSync(join(raiz, a), 'utf8').replace(/\r/g, '')

describe('a comanda quitada diz a hora da quitação', () => {
  const base = { paga: true, origem: 'ATENDIMENTO' as const, emAberto: 0, pagaEm: '2026-11-27T14:43:00+00:00' }
  it('quitada depois, a hora é a do último pagamento', async () => {
    const { pagaEmDaComanda } = await import('@/lib/pdv/situacoes')
    expect(pagaEmDaComanda(base, '2026-11-27T16:05:00+00:00')).toBe('2026-11-27T16:05:00+00:00')
    expect(pagaEmDaComanda({ ...base, origem: 'PLANO' }, '2026-11-27T16:05:00+00:00')).toBe('2026-11-27T16:05:00+00:00')
  })
  it('com dinheiro em aberto, a venda, a paga de uma vez ou o pagamento só com o dia: segue a de antes', async () => {
    const { pagaEmDaComanda } = await import('@/lib/pdv/situacoes')
    expect(pagaEmDaComanda({ ...base, emAberto: 50 }, '2026-11-27T16:05:00+00:00')).toBe(base.pagaEm)
    expect(pagaEmDaComanda({ ...base, origem: 'VENDA' }, '2026-11-27T16:05:00+00:00')).toBe(base.pagaEm)
    expect(pagaEmDaComanda(base, '2026-11-27T14:43:00+00:00')).toBe(base.pagaEm)
    expect(pagaEmDaComanda(base, null)).toBe(base.pagaEm)
    // Gravado só com o dia (a âncora do meio-dia de Brasília): não há hora para dizer.
    expect(pagaEmDaComanda(base, '2026-11-28T15:00:00.000Z')).toBe(base.pagaEm)
  })
  it('a leitura das comandas lê o último pagamento das pagas e o usa', () => {
    const s = fonte('lib/pdv/comandas.ts')
    expect(s).toMatch(/\.select\('appointment_id, treatment_plan_id, paid_at, branches!inner\(tenant_id\)'\)/)
    expect(s).toMatch(/pagaEm: pagaEmDaComanda\(/)
  })
})
