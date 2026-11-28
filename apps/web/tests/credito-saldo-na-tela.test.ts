import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { textoDoSaldoDoCredito } from '@/lib/creditos/saldo-na-tela'

const br = (s: string) => s.replace(/\u00a0/g, ' ')

// A36 da 8ª simulação: pagar com "Crédito interno" não mostrava o saldo nem o que sobra.
describe('A36: o saldo do crédito na tela de cobrança', () => {
  it('cobre: o saldo e o que sobra', () => {
    const t = textoDoSaldoDoCredito(450, 90)
    expect(t.cobre).toBe(true)
    expect(br(t.texto)).toBe('Crédito interno: R$ 450,00 · depois deste pagamento: R$ 360,00')
  })
  it('não cobre: o que falta, e que o banco recusa', () => {
    const t = textoDoSaldoDoCredito(450, 500)
    expect(t.cobre).toBe(false)
    expect(br(t.texto)).toContain('faltam R$ 50,00')
  })
  it('sem saldo', () => {
    expect(textoDoSaldoDoCredito(0, 100).cobre).toBe(false)
  })
})

// A2 da 42ª (princípios 3 e 7): dividida a conta, o saldo se compara com a PARTE posta no crédito interno —
// a action só debita essa parte. No Receber do plano (`checkout-wizard`) o aviso usava o plano inteiro
// (`liquido`), e dizia "o pagamento com crédito é recusado" com o Pix já cobrindo o resto.
describe('A2: o aviso do saldo compara com a parte no crédito interno', () => {
  const fonte = (arq: string) => readFileSync(path.join(__dirname, '..', arq), 'utf8')
  const valores = (t: string) => [...t.matchAll(/<SaldoDoCredito\b[^>]*?\bvalor=\{([^}]*)\}/g)].map(m => m[1]!.trim())

  it('no Receber do plano: a parte da 1ª forma (o que falta das outras), não o plano inteiro', () => {
    const v = valores(fonte('components/branch/checkout-wizard.tsx'))
    expect(v.length).toBeGreaterThan(0)
    for (const x of v) {
      expect(x, 'o valor do aviso').not.toMatch(/\bliquido\b/)
      expect(x, 'o valor do aviso').toMatch(/\bnaPrimeiraForma\b/)
    }
  })

  it('nas outras telas de cobrança: a parte (a 1ª forma pelo que falta das outras; a outra forma, o valor dela)', () => {
    expect(valores(fonte('components/shared/campos-do-pagamento.tsx'))).toEqual(['pagaAgora'])
    expect(fonte('components/shared/campos-do-pagamento.tsx')).toMatch(/const pagaAgora = forma === 'AVISTA'\s*\?\s*\(total !== undefined && outras\.length \? Math\.max\(0, valorDaPrincipal\(total, outras\)\)/)
    expect(valores(fonte('components/shared/outras-formas.tsx'))).toEqual(['valor'])
  })
})
