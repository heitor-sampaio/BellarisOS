import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rotuloDoPassoDoPagamento } from '@/lib/plano-de-tratamento/textos'

const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const sp = (s: string) => s.replace(/ /g, ' ')

/**
 * DP-03 (vendas-financeiro; princípio 3): "A tela do plano fechado mostra
 * 'Valor do plano', 'Recebido' e 'A receber'". D7 da 31ª: o plano da C05
 * (R$ 297 de entrada + 3× R$ 300 no crediário) mostrava no passo "Contrato e
 * pagamento" só "Recebido", com R$ 900 a receber. A situação do plano não muda
 * (PL-20: o dinheiro recebido vence o documento aberto — "Em andamento"); o
 * passo diz o que falta.
 */
describe('o passo "Contrato e pagamento" diz o que falta receber do plano', () => {
  it('pago inteiro: Recebido', () => {
    expect(rotuloDoPassoDoPagamento({ recebido: true, aReceber: 0 })).toEqual({ texto: 'Recebido', falta: false })
  })
  it('recebido com saldo: diz quanto falta', () => {
    const r = rotuloDoPassoDoPagamento({ recebido: true, aReceber: 900 })
    expect({ ...r, texto: sp(r.texto) }).toEqual({ texto: 'Recebido em parte · R$ 900,00 a receber', falta: true })
  })
  it('nada recebido: Falta receber', () => {
    expect(rotuloDoPassoDoPagamento({ recebido: false, aReceber: 0 })).toEqual({ texto: 'Falta receber', falta: true })
  })
  it('o passo lê o a receber da fonte única do plano', () => {
    expect(ler('actions/treatment-plans.ts')).toContain('aReceber:    financeiro.aReceber')
    expect(ler('components/branch/passos-do-plano.tsx')).toContain('rotuloDoPassoDoPagamento(')
  })
})
