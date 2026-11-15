import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDasVencidasNaChegada as texto } from '@/lib/appointments/texto-das-vencidas'

/** O `formatBRL` separa o R$ com o espaço fixo. */
const textoDasVencidasNaChegada = (...a: Parameters<typeof texto>) => texto(...a)?.replace(/\u00a0/g, ' ') ?? null

/**
 * D13 da 9ª simulação: o check-in de quem tem parcela VENCIDA avisa, sem
 * recusar a chegada. Com o PDV (CX1 do plano de adaptação: "O PDV recebe
 * toda comanda e também a parcela do crediário que a cliente veio pagar"), o
 * aviso diz "receba no PDV" — dizia "no Financeiro". E o check-in do Copilot
 * dá o MESMO aviso que a agenda (ficou de fora do CP1, 16/11).
 */
describe('o aviso das parcelas vencidas na chegada', () => {
  it('diz o nome, quantas, quanto, desde quando — e que se recebe no PDV', () => {
    expect(textoDasVencidasNaChegada('Mariana Souza', { quantidade: 1, valor: 1294, maisAntiga: '2026-11-05T12:00:00-03:00' }))
      .toBe('Mariana tem 1 parcela vencida (R$ 1.294,00, desde 05/11): receba no PDV.')
  })

  it('duas parcelas, sem a data da mais antiga', () => {
    expect(textoDasVencidasNaChegada('Ana', { quantidade: 2, valor: 300, maisAntiga: null }))
      .toBe('Ana tem 2 parcelas vencidas (R$ 300,00): receba no PDV.')
  })

  it('sem nome, "A cliente"', () => {
    expect(textoDasVencidasNaChegada(null, { quantidade: 1, valor: 50, maisAntiga: null }))
      .toBe('A cliente tem 1 parcela vencida (R$ 50,00): receba no PDV.')
  })

  it('sem vencida, nada', () => {
    expect(textoDasVencidasNaChegada('Ana', { quantidade: 0, valor: 0, maisAntiga: null })).toBeNull()
  })

  it('a agenda e o Copilot chamam o mesmo aviso (lib/appointments/vencidas-na-chegada)', () => {
    const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
    expect(ler('actions/appointments.ts')).toMatch(/from '@\/lib\/appointments\/vencidas-na-chegada'/)
    const copilot = ler('lib/copilot/ferramentas/agenda-escrita.ts')
    expect(copilot).toMatch(/from '@\/lib\/appointments\/vencidas-na-chegada'/)
    const checkIn = copilot.slice(copilot.indexOf("nome: 'fazer_check_in'"))
    expect(checkIn.slice(0, checkIn.indexOf('\n}\n')), 'o efetivar do check-in dá o aviso').toMatch(/avisoDasVencidasNaChegada\(/)
  })
})
