import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unidadesDaPessoa } from '@/lib/unidades/do-membro'

// OP-35 (o Heitor, 2026-11-13: "coloca uma caixa de seleção para a unidade,
// simples"): o "Agendar" do card e do inbox escolhe a unidade numa caixa — com
// duas ou mais, vazia; com uma, já escolhida e sem caixa. As unidades são as
// da PESSOA (CLAUDE.md §11: quem não tem "A rede inteira" só agenda nas dela).
// No portal da unidade, o card usava só a do endereço (a vendedora de duas
// unidades trocava de portal para agendar na outra), e o inbox oferecia as da
// rede inteira, também as fora do alcance.

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('unidadesDaPessoa', () => {
  const ativas = [
    { id: 'a', name: 'Itajubá', slug: 'itajuba' },
    { id: 'b', name: 'Pouso Alegre', slug: 'pouso' },
    { id: 'c', name: 'Varginha', slug: 'varginha' },
  ]
  it('"A rede inteira" (null): todas as ativas', () => {
    expect(unidadesDaPessoa(ativas, null).map(u => u.id)).toEqual(['a', 'b', 'c'])
  })
  it('duas unidades: só as dela, na ordem da lista', () => {
    expect(unidadesDaPessoa(ativas, ['b', 'a']).map(u => u.id)).toEqual(['a', 'b'])
  })
  it('uma unidade: só ela; a desativada (fora das ativas) não volta', () => {
    expect(unidadesDaPessoa(ativas, ['c']).map(u => u.id)).toEqual(['c'])
    expect(unidadesDaPessoa(ativas, ['z', 'a']).map(u => u.id)).toEqual(['a'])
  })
})

describe('o Agendar do CRM no portal da unidade', () => {
  it('o quadro recebe as unidades da pessoa, e o card as usa fora do portal da rede', () => {
    const pagina = fonte('app/[slug]/oportunidades/page.tsx')
    expect(pagina).toMatch(/unidadesDaPessoa\(await unidadesParaCriar\(ctx\.tenantId!\), unidadesDoContexto\(ctx\)\)/)
    expect(pagina).toMatch(/unidadesDeAgendar=\{/)
    const quadro = fonte('components/branch/crm-board.tsx')
    expect(quadro).toMatch(/networkMode \? \(branches \?\? \[\]\)\s*:\s*unidadesDeAgendar/)
  })
  it('o inbox agenda nas unidades da pessoa, não nas da rede inteira', () => {
    const pagina = fonte('app/[slug]/inbox/page.tsx')
    expect(pagina).toMatch(/unidadesDaPessoa\(branches, unidadesDoContexto\(ctx\)\)/)
    expect(pagina).toMatch(/unidadesDeAgendar=\{/)
    const painel = fonte('components/admin/inbox-lead-panel.tsx')
    expect(painel).toMatch(/branches=\{unidadesDeAgendar \?\? branches\}/)
  })
})
