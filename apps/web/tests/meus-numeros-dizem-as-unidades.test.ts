import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O "Meu faturamento do mês" diz de quais unidades é o número (comissoes:CA-06;
 * princípio 3). A conta da vista pessoal soma a unidade do endereço e as outras
 * em que ela atende (`unidadesDoQueEDela`) — a do endereço entra mesmo sem o
 * "Atende" nela. A linha dizia "Nas 2 unidades em que você atende" a quem atende
 * em uma: o número era o das duas, e o "em que você atende" não era verdade.
 * A linha passa a dizer as unidades do número, pelo nome.
 */
const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o "Meu faturamento" diz as unidades do número', () => {
  it('nomesDasUnidades junta os nomes, na ordem do número', async () => {
    const m = await import('@/lib/metrics/escopo') as Record<string, unknown>
    const f = m.nomesDasUnidades as ((ids: string[], nomes: Map<string, string>) => string) | undefined
    expect(f, 'nomesDasUnidades em lib/metrics/escopo').toBeTypeOf('function')
    const nomes = new Map([['A', 'Friburgo'], ['B', 'Teresópolis'], ['C', 'Petrópolis']])
    expect(f!(['A', 'B'], nomes)).toBe('Friburgo e Teresópolis')
    expect(f!(['A', 'B', 'C'], nomes)).toBe('Friburgo, Teresópolis e Petrópolis')
  })
  it('o dashboard da unidade não diz "em que você atende" do número que soma a do endereço', () => {
    const pagina = ler('app/[slug]/dashboard/page.tsx')
    expect(pagina).not.toContain('unidades em que você atende')
    expect(pagina).toMatch(/data-nas-unidades[^>]*>\s*Em \{nomesDasUnidades\(unidadesDoDinheiro, nomeDaUnidade\)\}/)
  })
})
