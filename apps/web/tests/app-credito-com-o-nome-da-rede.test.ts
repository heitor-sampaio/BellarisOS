import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formaDoLancamento } from '@/lib/financeiro/formas'
import { formaERecibosDaLinha } from '@/lib/financeiro/formas-da-parcela'

/**
 * CI-10: "Nas telas da equipe, o crédito da cliente se chama 'Crédito
 * interno'; no app, 'Crédito em <o nome da rede>'". O saldo já dizia; a linha
 * do pagamento e a do estorno com crédito diziam "Crédito interno".
 */
describe('a forma do crédito interno no app', () => {
  it('diz o nome que o app dá ao crédito', () => {
    expect(formaDoLancamento({ metodo: 'INTERNAL_CREDIT', pago: true, credito: 'Crédito em Ateliê Cupuaçu' })).toBe('Crédito em Ateliê Cupuaçu')
  })
  it('sem o nome (as telas da equipe), "Crédito interno"; as outras formas não mudam', () => {
    expect(formaDoLancamento({ metodo: 'INTERNAL_CREDIT', pago: true })).toBe('Crédito interno')
    expect(formaDoLancamento({ metodo: 'PIX', pago: true, credito: 'Crédito em X' })).toBe('Pix')
  })
  it('a parcela em várias formas também', () => {
    const r = formaERecibosDaLinha({ id: 'a', formasDaParcela: [
      { id: 'a', forma: 'PIX', vezes: null, valor: 50 }, { id: 'b', forma: 'INTERNAL_CREDIT', vezes: null, valor: 30 },
    ] }, null, 'Crédito em X')
    expect(r.forma).toMatch(/^Pix R\$\s50,00 \+ Crédito em X R\$\s30,00$/)
    expect(r.recibos.map(x => x.forma)).toEqual(['Pix', 'Crédito em X'])
  })
})

describe('as telas do app passam o nome', () => {
  const ler = (c: string) => readFileSync(join(__dirname, '..', c), 'utf8')
  it('o Financeiro e o Histórico', () => {
    for (const c of ['app/[slug]/cliente/financeiro/page.tsx', 'app/[slug]/cliente/historico/page.tsx']) {
      expect(ler(c), c).toMatch(/formaDoLancamento\(\{[^}]*credito: creditoNaRede/)
      expect(ler(c), c).toMatch(/formaERecibosDaLinha\(r, formaDoLancamento\(\{[^}]*\}\), creditoNaRede\)/)
    }
  })
})
