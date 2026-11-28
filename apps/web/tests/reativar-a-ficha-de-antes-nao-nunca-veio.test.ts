import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O "Reativar clientes" não diz "Nunca veio" de quem é cliente de antes do
 * sistema (indicadores:CC-05; crm-inbox:IM-20; princípio 3). A ficha migrada
 * com "Cliente desde 2017" e sem visita registrada (nem a de antes) aparecia
 * "Nunca veio" — o que a própria ficha desmente. Sem visita, a linha diz o que
 * a ficha tem: "Cliente desde mar 2017". Quem foi cadastrada no sistema e não
 * veio segue "Nunca veio". (A "Última visita" de antes já aparece como visita,
 * "· antes do sistema".) Decisão do Claude, 28/11, pelo princípio 3.
 */
const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o "Reativar clientes" e a ficha de antes do sistema', () => {
  it('a linha sem visita diz o "Cliente desde" da importação, e só sem ele "Nunca veio"', async () => {
    const m = await import('@/components/shared/quadros-de-clientes') as Record<string, unknown>
    const f = m.semVisitaDoReativar as ((clienteDesde: string | null | undefined) => string) | undefined
    expect(f, 'semVisitaDoReativar em quadros-de-clientes').toBeTypeOf('function')
    expect(f!('2017-03-01')).toBe('Cliente desde mar 2017')
    expect(f!(null)).toBe('Nunca veio')
    expect(f!(undefined)).toBe('Nunca veio')
  })
  it('o quadro usa a função, e a lista da rede traz o "Cliente desde" da ficha', () => {
    const q = ler('components/shared/quadros-de-clientes.tsx')
    expect(q).toContain(': semVisitaDoReativar(c.clienteDesde)')
    expect(q).not.toMatch(/`Última visita há \$\{c\.diasSemVir\} dias` : 'Nunca veio'/)
    const u = ler('lib/metrics/unidade.ts')
    expect(u).toMatch(/clienteDesde: string \| null/)
    expect(u).toMatch(/select\('id, cliente_desde'\)/)
    // Os dois dashboards passam o dado ao quadro.
    for (const p of ['app/admin/dashboard/page.tsx', 'app/[slug]/dashboard/page.tsx']) {
      expect(ler(p), p).toContain('clienteDesde: c.clienteDesde')
    }
  })
  it('o Copilot dá a mesma resposta (r3-f13-10): a de antes sem visita é "cliente desde", não "nunca veio"', () => {
    const c = ler('lib/copilot/ferramentas/clientes.ts')
    expect(c).toMatch(/x\.clienteDesde \? `cliente desde \$\{mesDeClienteDesde\(\{ clienteDesde: x\.clienteDesde \}\)\}`/)
  })
})
