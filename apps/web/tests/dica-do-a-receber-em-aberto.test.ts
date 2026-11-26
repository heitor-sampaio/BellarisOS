import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DicaDoVencimento } from '@/components/shared/nota-do-vencimento'

/**
 * D7 da 34ª simulação (FN-11 — o Heitor, 25/11: "O cartão vira 'A receber · em
 * aberto' e soma tudo"; princípio 3): o número grande do "A receber · em aberto"
 * (e o do "A receber da operadora", A27 da 24ª) é o em aberto de QUALQUER
 * vencimento, mas a dica dizia "O valor é o que vence no período (pelo
 * vencimento)". A dica que contradiz o número se corrige, mais curta. O "A pagar
 * · vence no período" segue pelo vencimento, e a dica dele não muda.
 */
const texto = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('a dica do cartão cujo número é o em aberto', () => {
  it('o A receber diz que o valor é o em aberto, de qualquer vencimento', () => {
    const t = texto(createElement(DicaDoVencimento, { valor: 100, emAbertoTotal: 900, noTopoOEmAberto: true }))
    expect(t).toContain('O valor é o em aberto, de qualquer vencimento.')
    expect(t).not.toContain('O valor é o que vence no período')
    expect(t, 'o "Vence no período" segue pelo vencimento (A34 de 27/10)').toContain('O “Vence no período” é pelo vencimento.')
  })

  it('a operadora: o líquido em aberto, com o bruto do em aberto', () => {
    const t = texto(createElement(DicaDoVencimento, {
      valor: 475, emAbertoTotal: 950, noTopoOEmAberto: true, bruto: { periodo: 500, emAberto: 1000 },
    }))
    expect(t).toContain('líquido')
    expect(t).toMatch(/R\$\s1\.000,00 bruto/)
    expect(t).not.toContain('pelo vencimento, no período')
  })

  it('o A pagar segue pelo vencimento', () => {
    const t = texto(createElement(DicaDoVencimento, { valor: 100, emAbertoTotal: 900 }))
    expect(t).toContain('O valor é o que vence no período (pelo vencimento).')
  })

  it('os dois Financeiros passam o "em aberto no topo" à dica do A receber e da operadora', () => {
    for (const arquivo of ['components/admin/admin-financial-view.tsx', 'components/branch/financial-hub.tsx']) {
      const f = fonte(arquivo)
      expect(f.match(/<DicaDoVencimento[^>]*noTopoOEmAberto/g)?.length, arquivo).toBe(2)
    }
  })
})
