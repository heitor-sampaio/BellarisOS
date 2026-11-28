import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ondeVoltaOEstorno } from '@/lib/financeiro/formas'

const ler = (c: string) => readFileSync(join(__dirname, '..', c), 'utf8')

/**
 * CI-04 ("estornar esse pagamento devolve o crédito") e princípio 3: a
 * devolução da venda paga com crédito interno oferecia "Estorno — o dinheiro
 * volta à cliente na forma em que ela pagou", sem dizer que a forma é o crédito.
 */
describe('o "Estorno" da devolução diz a forma em que ela pagou', () => {
  it('pago com crédito interno: volta ao crédito', () => {
    expect(ondeVoltaOEstorno(['INTERNAL_CREDIT'])).toBe('volta ao crédito interno dela, a forma em que ela pagou')
  })
  it('numa forma, o nome dela', () => {
    expect(ondeVoltaOEstorno(['PIX', 'PIX'])).toBe('o dinheiro volta à cliente na forma em que ela pagou (Pix)')
  })
  it('em várias, as formas', () => {
    expect(ondeVoltaOEstorno(['PIX', 'INTERNAL_CREDIT'])).toBe('o valor volta à cliente nas formas em que ela pagou (Pix e Crédito interno)')
  })
  it('sem saber as formas, o texto de antes', () => {
    expect(ondeVoltaOEstorno(undefined)).toBe('o dinheiro volta à cliente na forma em que ela pagou')
  })
  it('a devolução de parte da venda passa as formas à escolha', () => {
    expect(ler('components/shared/escolha-da-devolucao.tsx')).toContain('ondeVoltaOEstorno(formas)')
    expect(ler('components/shared/devolver-parte-da-venda.tsx')).toContain('formas={previa.formas}')
    expect(ler('actions/devolucao-de-produto.ts')).toContain('previa.formas =')
  })
})

/**
 * Princípio 7 ("botões e comandos fáceis de achar"): o "Devolver só parte da
 * venda" era um botão fantasma ao lado do "Confirmar estorno" e passava
 * despercebido. Tem o peso do "Voltar" (btn-secondary).
 */
describe('o "Devolver só parte da venda" tem o peso dos comandos ao lado', () => {
  it('é btn-secondary', () => {
    expect(ler('components/shared/confirmar-estorno.tsx'))
      .toMatch(/className="btn-secondary" disabled=\{estornando\} onClick=\{onDevolverParte\}>Devolver só parte da venda/)
  })
})
