import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  conferidoValido, recusaDoFundoDeTroco, avisoDoFundoDeTroco, recusaDoDinheiroContado,
  recusaDoEsperadoNaGaveta, avisoDoConferido, LIMITE_DO_DINHEIRO_DO_FECHAMENTO,
} from '@/lib/financeiro/conferencia-do-fechamento'

/**
 * O Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
 * feito." No Fechamento do dia, o fundo de troco ia até R$ 1.000.000 (e o
 * acima dizia "Informe o fundo de troco (R$ 0,00 ou mais).") e o conferido
 * das outras formas, até R$ 10.000.000 em módulo ("Informe o valor conferido
 * ou deixe em branco.").
 *
 * Decisão do Claude, 25/11: acima do antigo teto a tela avisa e o servidor
 * grava. O impossível é o registro:
 * - o dinheiro da gaveta grava em `fechamentos_do_dia` (`esperado_dinheiro` e
 *   `contado_dinheiro`, numeric(12,2)): até R$ 9.999.999.999,99. O fundo de
 *   troco (`fundos_de_troco.valor`, numeric sem precisão) entra no esperado,
 *   então o limite dele é o mesmo — e o esperado (fundo + o dia) também;
 * - o conferido das outras formas vai num jsonb, sem tipo: o limite é o dos
 *   centavos exatos (a conta é em centavos, e o número do JavaScript só é
 *   exato até 9.007.199.254.740.991).
 */

const APP = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(APP, p), 'utf8')
const NO_REGISTRO = 'No máximo R$ 9.999.999.999,99 (o limite do registro).'

describe('o fundo de troco: acima de R$ 1.000.000 avisa', () => {
  it('grava R$ 2.000.000, com o aviso', () => {
    expect(recusaDoFundoDeTroco(2_000_000)).toBeNull()
    expect(avisoDoFundoDeTroco(2_000_000)).toBe('Acima do comum (mais de 1.000.000 reais). Confira: o valor vale como está.')
    expect(avisoDoFundoDeTroco(1_000_000)).toBeNull()
    expect(recusaDoFundoDeTroco(0)).toBeNull()
  })
  it('o impossível: negativo, sem número e acima do registro — cada um com a sua mensagem', () => {
    expect(LIMITE_DO_DINHEIRO_DO_FECHAMENTO).toBe(9_999_999_999.99)
    expect(recusaDoFundoDeTroco(-1)).toBe('Informe o fundo de troco (R$ 0,00 ou mais).')
    expect(recusaDoFundoDeTroco(Number.NaN)).toBe('Informe o fundo de troco (R$ 0,00 ou mais).')
    expect(recusaDoFundoDeTroco(9_999_999_999.99)).toBeNull()
    expect(recusaDoFundoDeTroco(10_000_000_000)).toBe(NO_REGISTRO)
  })
  it('o dinheiro contado e o esperado na gaveta também param no registro', () => {
    expect(recusaDoDinheiroContado(5_000_000)).toBeNull()
    expect(recusaDoDinheiroContado(-1)).toBe('Informe o dinheiro contado.')
    expect(recusaDoDinheiroContado(10_000_000_000)).toBe(NO_REGISTRO)
    expect(recusaDoEsperadoNaGaveta(9_999_999_999.99)).toBeNull()
    expect(recusaDoEsperadoNaGaveta(10_000_000_000)).toBe('O dinheiro esperado na gaveta passa de R$ 9.999.999.999,99 (o limite do registro): confira o fundo de troco.')
  })
  it('a action usa as mesmas contas, sem o 1.000.000', () => {
    const acao = ler('actions/fechamento.ts')
    expect(acao).toMatch(/recusaDoFundoDeTroco\(valor\)/)
    expect(acao).toMatch(/recusaDoDinheiroContado\(contado\)/)
    expect(acao).toMatch(/recusaDoEsperadoNaGaveta\(resumo\.esperadoDinheiro\)/)
    expect(acao).not.toMatch(/1_000_000/)
  })
  it('a tela mostra o aviso ao lado do campo do fundo', () => {
    const tela = ler('components/shared/fechamento-do-dia-tela.tsx')
    expect(tela).toMatch(/avisoDoFundoDeTroco\(/)
    expect(tela).toMatch(/data-acima-do-comum="fundo-de-troco"/)
  })
})

describe('o valor conferido das outras formas: acima de R$ 10.000.000 avisa', () => {
  it('grava R$ 20.000.000 (e −R$ 20.000.000), com o aviso', () => {
    expect(conferidoValido({ PIX: 20_000_000 }, ['PIX'])).toEqual({ ok: true, conferido: { PIX: 20_000_000 } })
    expect(conferidoValido({ PIX: -20_000_000 }, ['PIX'])).toEqual({ ok: true, conferido: { PIX: -20_000_000 } })
    expect(avisoDoConferido(20_000_000)).toBe('Acima do comum (mais de 10.000.000 reais). Confira: o valor vale como está.')
    expect(avisoDoConferido(-20_000_000)).toBe('Acima do comum (mais de 10.000.000 reais). Confira: o valor vale como está.')
    expect(avisoDoConferido(10_000_000)).toBeNull()
  })
  it('o impossível: sem número, e além dos centavos exatos — e a mensagem diz qual', () => {
    expect(conferidoValido({ PIX: 'dez' }, ['PIX'])).toEqual({ error: 'Informe o valor conferido ou deixe em branco.' })
    expect(conferidoValido({ PIX: 1e15 }, ['PIX'])).toEqual({ error: 'No máximo R$ 90.071.992.547.409,91 (o maior valor com centavos exatos).' })
    expect(conferidoValido({ PIX: 90_000_000_000_000 }, ['PIX'])).toEqual({ ok: true, conferido: { PIX: 90_000_000_000_000 } })
  })
  it('o arquivo não guarda o teto antigo como recusa, e a tela avisa ao lado do campo', () => {
    expect(ler('lib/financeiro/conferencia-do-fechamento.ts')).not.toMatch(/Math\.abs\(valor\) > 10_000_000/)
    const tela = ler('components/shared/fechamento-do-dia-tela.tsx')
    expect(tela).toMatch(/avisoDoConferido\(/)
    expect(tela).toMatch(/data-acima-do-comum="conferido"/)
  })
})
