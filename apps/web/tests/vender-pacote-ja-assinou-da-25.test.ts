import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { avisoDoJaAssinou } from '@/lib/documentos/aviso-da-venda'

/**
 * A5(b) da 25ª simulação (princípio 7): no PDV, "Já assinou: vender" não
 * reagia — sem a assinatura, a venda devolve o MESMO contrato para assinar
 * (PC2: o contrato antes do dinheiro), e a tela o trocava por ele mesmo, sem
 * dizer nada. Agora diz por que não vendeu.
 */
describe('A5(b): "Já assinou: vender" sem a assinatura diz por quê', () => {
  it('o mesmo contrato, ainda sem assinar: o aviso', () => {
    expect(avisoDoJaAssinou('c1', { id: 'c1', status: 'PENDENTE' }))
      .toBe('A cliente ainda não assinou o contrato: colha a assinatura ou envie o link.')
  })
  it('outro contrato (a venda mudou) ou o primeiro pedido: nada', () => {
    expect(avisoDoJaAssinou('c1', { id: 'c2', status: 'PENDENTE' })).toBeNull()
    expect(avisoDoJaAssinou(null, { id: 'c1', status: 'PENDENTE' })).toBeNull()
  })
  it('a venda do pacote usa o aviso', () => {
    const t = readFileSync(path.join(__dirname, '..', 'components', 'shared', 'vender-pacote.tsx'), 'utf8')
    expect(t).toMatch(/avisoDoJaAssinou\(contrato\?\.id \?\? null, r\.contratoParaAssinar\)/)
  })
})
