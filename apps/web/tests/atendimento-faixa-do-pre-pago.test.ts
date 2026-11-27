import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDaSessaoDoPrePago } from '@/lib/appointments/sessao-do-pacote'

/**
 * A3 da 37ª simulação (AG-56: "o que já foi pago aparece como pago";
 * princípio 3): a tela do atendimento da sessão de PACOTE tem a faixa "Sessão
 * 1 de 6 do pacote …, já paga"; a do PRÉ-PAGO não tinha (a página passava só
 * `isPrePago`). A mesma faixa, para o pré-pago.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const sp = (t: string) => t.replace(/ /g, ' ')

describe('a faixa da sessão do pré-pago na tela do atendimento', () => {
  it('o texto, como o do pacote', () => {
    expect(textoDaSessaoDoPrePago({ numero: 1, total: 3, nome: 'Drenagem' }))
      .toBe('Sessão 1 de 3 do pré-pago de Drenagem, já paga.')
    expect(textoDaSessaoDoPrePago({ numero: 2, total: null, nome: null }))
      .toBe('Sessão 2 do pré-pago, já paga.')
  })
  it('no crediário com parcelas em aberto, não é "já paga"', () => {
    expect(sp(textoDaSessaoDoPrePago({ numero: 1, total: 3, nome: 'Drenagem', emAberto: 200, mostraOValor: true })))
      .toBe('Sessão 1 de 3 do pré-pago de Drenagem: incluída no pré-pago, que tem R$ 200,00 em aberto.')
    expect(textoDaSessaoDoPrePago({ numero: 1, total: 3, nome: 'Drenagem', emAberto: 200, mostraOValor: false }))
      .toBe('Sessão 1 de 3 do pré-pago de Drenagem: incluída no pré-pago, que tem parcelas em aberto.')
  })
  it('a página lê a sessão do pré-pago e a tela mostra a faixa', () => {
    expect(fonte('app/_shared/sessao-de-atendimento.tsx')).toContain('sessaoDoPrePago={')
    const tela = fonte('components/branch/appointment-session.tsx')
    expect(tela).toContain('data-sessao-do-pre-pago')
    expect(tela).toContain('textoDaSessaoDoPrePago(')
  })
})
