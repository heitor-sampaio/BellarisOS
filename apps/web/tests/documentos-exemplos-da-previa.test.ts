import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { exemplosDoTipo } from '@/lib/documentos/exemplos'

// A16 da 37ª (princípio 3, o que a tela mostra é o que vale na conta): a prévia
// dos modelos usava exemplos que não fechavam (entrada de R$ 800 + 4 × R$ 1.000
// contra um pacote de R$ 1.800) e datas fixas de setembro de 2026. Os exemplos
// da prévia fecham a conta do tipo do modelo e as datas partem de hoje.

const reais = (s: string | null | undefined) => Number(String(s ?? '0').replace(/[^\d,]/g, '').replace(',', '.'))
const AGORA = new Date('2027-03-10T15:00:00Z')

describe('os exemplos da prévia fecham a conta', () => {
  it.each([
    ['CONTRATO', 'procedimento.valor'],
    ['CONTRATO_PLANO', 'plano.total'],
    ['CONTRATO_PACOTE', 'pacote.total'],
  ] as const)('%s: entrada + parcelas = o valor menos o desconto', (tipo, doValor) => {
    const e = exemplosDoTipo(tipo, AGORA)
    const valor = reais(e[doValor])
    expect(valor).toBeGreaterThan(0)
    expect(reais(e['pagamento.subtotal'])).toBe(valor)
    const pago = valor - reais(e['pagamento.desconto'])
    expect(reais(e['pagamento.entrada']) + Number(e['pagamento.parcelas']) * reais(e['pagamento.valor_parcela'])).toBeCloseTo(pago, 2)
    expect(e['pagamento.forma']).toContain(`entrada de ${e['pagamento.entrada']}`)
    expect(e['pagamento.forma']).toContain(`com desconto de ${e['pagamento.desconto']} sobre ${e[doValor]}`)
  })

  it('o plano: a lista soma o total, e as sessões também', () => {
    const e = exemplosDoTipo('CONTRATO_PLANO', AGORA)
    const linhas = String(e['procedimentos.lista']).split('\n')
    expect(linhas.reduce((t, l) => t + reais(l.split(' — ')[2]), 0)).toBe(reais(e['plano.total']))
    expect(linhas.reduce((t, l) => t + Number(/(\d+) sess/.exec(l)![1]), 0)).toBe(Number(e['plano.sessoes']))
  })

  it('o pacote: as sessões dos procedimentos somam as do pacote', () => {
    const e = exemplosDoTipo('CONTRATO_PACOTE', AGORA)
    const sessoes = [...String(e['pacote.procedimentos']).matchAll(/(\d+) sess/g)].reduce((t, m) => t + Number(m[1]), 0)
    expect(sessoes).toBe(Number(e['pacote.sessoes']))
  })

  it('as datas partem de hoje', () => {
    const e = exemplosDoTipo('CONTRATO_PACOTE', AGORA)
    expect(e['data.hoje']).toBe('10 de março de 2027')
    expect(e['data.hoje_curta']).toBe('10/03/2027')
    expect(e['pagamento.primeiro_vencimento']).toBe('09/04/2027')
    expect(e['pacote.validade']).toBe('180 dias, até 06/09/2027')
    expect(exemplosDoTipo('CONTRATO', AGORA)['agendamento.data']).toBe('17/03/2027')
    expect(exemplosDoTipo('TERMO', AGORA)['data.hoje_curta']).toBe('10/03/2027')
  })

  it('a prévia do editor usa os exemplos do tipo', () => {
    const editor = readFileSync(path.resolve(__dirname, '../components/admin/editor-rico/editor-rico.tsx'), 'utf8')
    expect(editor).toMatch(/exemplosDoTipo\(tipo\)/)
  })
})
