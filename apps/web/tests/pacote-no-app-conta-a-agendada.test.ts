import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as contagem from '@/lib/pre-pago/contagem'

/**
 * O cartão do pacote no Início do app conta a sessão já agendada (AG-56: "A
 * sessão já agendada não conta como 'para agendar'"; docs/regras/atendimento.md,
 * "A agendada não está 'para agendar'", A27 da 6ª). Dizia "0 de 3 sessões
 * realizadas · restam 3" com a sessão 1 já marcada para 02/12.
 */
type Texto = (realizadas: number, total: number, agendadas: number) => string
const texto = () => (contagem as unknown as { textoDoPacoteNoApp?: Texto }).textoDoPacoteNoApp

describe('o pacote no Início do app', () => {
  it('diz a agendada ao lado das que restam', () => {
    const f = texto()
    expect(f, 'textoDoPacoteNoApp em lib/pre-pago/contagem.ts').toBeTypeOf('function')
    expect(f!(0, 3, 1)).toBe('0 de 3 sessões realizadas · restam 3 · 1 agendada')
    expect(f!(1, 4, 2)).toBe('1 de 4 sessões realizadas · restam 3 · 2 agendadas')
  })
  it('sem agendada, o texto de sempre', () => {
    expect(texto()!(2, 3, 0)).toBe('2 de 3 sessões realizadas · restam 1')
  })
  it('a home conta as sessões disponíveis com agendamento ligado', () => {
    const home = readFileSync(join(__dirname, '..', 'app/[slug]/cliente/home/page.tsx'), 'utf8')
    expect(home).toMatch(/textoDoPacoteNoApp\(used, total, agendadas\)/)
    expect(home).toMatch(/const agendadas = \(pkg\.package_sessions \?\? \[\]\)\.filter\(s => s\.status === 'AVAILABLE' && !!s\.appointment_id\)\.length/)
  })
})
