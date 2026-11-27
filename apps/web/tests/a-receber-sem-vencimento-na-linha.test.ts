import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Princípio 3 (o que a tela mostra é o que vale): o valor a receber SEM data
 * (`due_date` nulo, `lancamentosDoPagamento` com o "A receber" sem vencimento)
 * aparecia com a data de criação ("27/11, 02:25") no Financeiro → A receber e
 * na ficha — e no app, como "Vence 27/11/2026". A linha diz "Sem vencimento".
 * Contar no período pela criação (FN-09) não muda.
 */
const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o em aberto sem vencimento', () => {
  it('é o não pago, não estornado e sem data', async () => {
    const { emAbertoSemVencimento, SEM_VENCIMENTO } = await import('@/lib/financeiro/vencimentos')
    expect(SEM_VENCIMENTO).toBe('Sem vencimento')
    expect(emAbertoSemVencimento({ pago: false, vencimento: null })).toBe(true)
    expect(emAbertoSemVencimento({ pago: false, vencimento: '2026-12-05T15:00:00.000Z' })).toBe(false)
    expect(emAbertoSemVencimento({ pago: true, vencimento: null })).toBe(false)
    expect(emAbertoSemVencimento({ pago: false, vencimento: null, estornado: true })).toBe(false)
  })

  it('a lista do Financeiro, a ficha e o app dizem "Sem vencimento" no lugar da data', () => {
    for (const tela of [
      'components/branch/financial-table.tsx',
      'components/branch/client-profile.tsx',
      'app/[slug]/cliente/financeiro/page.tsx',
      'app/[slug]/cliente/historico/page.tsx',
    ]) expect(ler(tela), tela).toContain('emAbertoSemVencimento(')
    expect(ler('components/client-portal/historico-tabs.tsx')).toContain('SEM_VENCIMENTO')
  })
})
