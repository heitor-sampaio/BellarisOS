import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  textoDaReaberturaDoPacote, textoDaReaberturaDoPlano, textoDaReaberturaDoPrePago,
} from '@/lib/financeiro/reabertura-do-estorno'

/**
 * DP-08 (o Heitor, 2026-11-07: "sim usa a mesma coisa do pacote") e o
 * cancelamento do pacote e do pré-pago, de quem tem o Financeiro em Gerenciar.
 * D1 da 35ª: quem tinha SÓ o Financeiro em Gerenciar não cancelava — o
 * "Cancelar" morava na ficha (que pede o Clientes) e na página do plano (que
 * pede o Atendimento), e a janela do estorno mandava "use “Cancelar pacote” na
 * ficha", onde ela não entra. O cancelamento passa a existir onde ela chega: a
 * janela do estorno do pagamento do pacote, do plano e do pré-pago (os dois
 * financeiros, a ficha e o PDV) tem o botão (decisão do Claude, 27/11).
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ') ?? null

describe('D1: o texto do estorno não manda a um lugar que a pessoa não abre', () => {
  it('com o botão na janela, o pacote não diz "na ficha"', () => {
    const t = sp(textoDaReaberturaDoPacote(1000, 1, 5, 'aqui'))!
    expect(t).toContain('1 das 5 sessões já foi feita')
    expect(t).not.toContain('na ficha')
    expect(t.endsWith('Para desfazer a venda:')).toBe(true)
  })
  it('o plano: a frase de antes, e sem "na ficha" com o botão', () => {
    expect(sp(textoDaReaberturaDoPlano(300)))
      .toBe('O dinheiro volta à cliente, e o plano volta a ter R$ 300,00 a receber. Para desfazer a venda, use “Cancelar plano” na ficha.')
    expect(sp(textoDaReaberturaDoPlano(300, 'aqui')))
      .toBe('O dinheiro volta à cliente, e o plano volta a ter R$ 300,00 a receber. Para desfazer a venda:')
  })
  it('o pré-pago: a frase de antes, e sem "na ficha" com o botão', () => {
    expect(sp(textoDaReaberturaDoPrePago(200)))
      .toBe('O dinheiro volta à cliente, e o pré-pago volta a ter R$ 200,00 a receber. Para desfazer a venda, cancele a sessão pré-paga na ficha.')
    expect(sp(textoDaReaberturaDoPrePago(200, 'aqui')))
      .toBe('O dinheiro volta à cliente, e o pré-pago volta a ter R$ 200,00 a receber. Para desfazer a venda:')
  })
})

describe('D1: a janela do estorno tem o cancelamento', () => {
  it('a action diz o que se cancela (o pacote, o plano aceito, as sessões livres do pré-pago)', () => {
    const a = ler('actions/financial.ts')
    const corpo = a.slice(a.indexOf('export async function reaberturaDoEstorno'), a.indexOf('export async function', a.indexOf('export async function reaberturaDoEstorno') + 10))
    expect(corpo).toMatch(/cancelar: \{ tipo: 'PACOTE'/)
    expect(corpo).toMatch(/cancelar: \{ tipo: 'PLANO'/)
    expect(corpo).toMatch(/cancelar: \{ tipo: 'PRE_PAGO'/)
    expect(corpo).toMatch(/textoDaReaberturaDoPlano\(/)
    expect(corpo).toMatch(/textoDaReaberturaDoPrePago\(/)
  })
  it('a janela abre as janelas de sempre do cancelamento', () => {
    const j = ler('components/shared/confirmar-estorno.tsx')
    expect(j).toContain('data-cancelar-pelo-estorno')
    expect(j).toMatch(/<CancelarPacote /)
    expect(j).toMatch(/<CancelarPlano /)
    expect(j).toMatch(/<CancelarUnidadePrePaga /)
  })
})
