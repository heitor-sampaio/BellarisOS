import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D14 da 35ª (princípio 7; a A6 da 34ª): na venda do pacote, de volta da
 * assinatura ("Continuar"), o formulário mostrava de novo o bloco do contrato
 * com "Colher assinatura" enquanto o servidor conferia se ele foi assinado (a
 * conferência relê o documento inteiro), e a conferência que falhava ficava
 * calada — o bloco seguia pedindo a assinatura já colhida. De volta, a tela diz
 * que confere, e o resultado: assinado, "Contrato assinado. Agora, o
 * pagamento."; senão, o bloco; e o erro, se houver.
 */
const f = readFileSync(join(__dirname, '..', 'components', 'shared', 'vender-pacote.tsx'), 'utf8')
const volta = f.slice(f.indexOf('function voltarDoContrato'), f.indexOf('function esquecerContrato'))

describe('a venda do pacote de volta da assinatura', () => {
  it('confere a assinatura sem mostrar de novo o pedido do contrato', () => {
    expect(volta).toMatch(/setConferindo\(true\)/)
    expect(volta).toMatch(/setConferindo\(false\)/)
    expect(f).toMatch(/\{contrato && !conferindo && \(/)
    expect(f).toMatch(/data-conferindo-a-assinatura/)
  })

  it('a conferência que falha diz o erro', () => {
    expect(volta).toMatch(/r\.error[\s\S]{0,40}setErro\(r\.error\)/)
  })
})
