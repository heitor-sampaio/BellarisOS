import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * PA-13 ("a sessão não se agenda") e CLAUDE.md §14 (o botão que a pessoa não
 * pode usar, a tela esconde): na rede que libera as sessões do pacote no
 * crediário só depois de pago, a venda com dinheiro em aberto oferecia logo
 * em seguida "Agendar a 1ª sessão agora?" — e o agendar recusava no fim.
 * A venda só devolve a 1ª sessão quando ela se agenda (a mesma conferência do
 * agendar, `conferirCredito`).
 */
describe('a venda do pacote não oferece agendar a sessão presa', () => {
  it('venderPacote confere a 1ª sessão como o agendar antes de oferecê-la', () => {
    const s = readFileSync(join(__dirname, '..', 'actions', 'pacotes.ts'), 'utf8')
    const i = s.indexOf('export async function venderPacote(')
    const corpo = s.slice(i, s.indexOf('\nexport ', i + 10))
    expect(corpo).toMatch(/conferirCredito\(admin, ctx\.tenantId!, clienteId, \{ tipo: 'PACOTE', id: primeira\.id as string \}\)/)
    expect(corpo).toMatch(/'error' in livre \? null :/)
  })
})
