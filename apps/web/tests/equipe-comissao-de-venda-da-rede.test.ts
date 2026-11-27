import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chipDaComissao } from '@/lib/comissoes/chip-do-membro'

/**
 * A comissão de venda na linha da Equipe diz o percentual da rede (o Heitor,
 * 25/11, escolheu "Diz o percentual da rede" para: "A linha diz 'Venda: a do
 * pacote, produto ou rede', sem dizer quanto." A proposta aprovada: "Venda: a
 * do pacote ou produto vendido (sem ela, a da rede: X%)").
 *
 * A rede tem DUAS regras de venda (comissoes.md, "A comissão de venda POR
 * PESSOA"): a "Venda de plano" (`plano_pct`) e a "Venda de produto"
 * (`produto_pct`); o pacote e o pré-pago não têm a da rede. Iguais, um número
 * só; diferentes, cada uma com o nome (princípio 3); sem nenhuma, a linha diz
 * número nenhum (princípio 4: não chutar) e sem explicação (o Heitor, 26/11,
 * "intuitivo não é explicativo"; A21 da 37ª).
 */
const base = { padrao: null, excecoes: 0, vendaPct: null, atende: false } as const

describe('o chip de quem vende sem a dela diz a comissão de venda da rede', () => {
  it('a mesma no plano e no produto: um número', () => {
    expect(chipDaComissao({ ...base, vendaDaRede: { plano: 5, produto: 5 } }))
      .toBe('Venda: a do pacote ou produto vendido (sem ela, a da rede: 5%)')
  })
  it('diferentes: cada uma com o nome', () => {
    expect(chipDaComissao({ ...base, vendaDaRede: { plano: 5, produto: 2.5 } }))
      .toBe('Venda: a do pacote ou produto vendido (sem ela, a da rede: 5% no plano, 2,5% no produto)')
  })
  it('só uma: a outra diz nenhuma', () => {
    expect(chipDaComissao({ ...base, vendaDaRede: { plano: null, produto: 3 } }))
      .toBe('Venda: a do pacote ou produto vendido (sem ela, a da rede: nenhuma no plano, 3% no produto)')
  })
  // A21 da 37ª: o parêntese "(sem ela, nenhuma: a rede não tem)" explicava a tela — o
  // Heitor, 26/11: "isso não é ser intuitivo, é ser explicativo e não isso que eu quero."
  it('a rede sem nenhuma: sem número e sem explicação', () => {
    expect(chipDaComissao({ ...base, vendaDaRede: { plano: null, produto: null } }))
      .toBe('Venda: a do pacote ou produto vendido')
  })
  it('com a dela, a dela (como antes)', () => {
    expect(chipDaComissao({ ...base, vendaPct: 4, vendaDaRede: { plano: 5, produto: 5 } })).toBe('Venda 4%')
  })
})

const WEB = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

describe('as duas Equipes passam a comissão de venda da rede ao chip', () => {
  it('o componente leva a da rede ao chip', () => {
    const t = ler('components/admin/comissao-do-membro.tsx')
    expect(t).toMatch(/chipDaComissao\(\{[^}]*vendaDaRede/)
  })
  for (const tela of ['app/admin/team/page.tsx', 'app/[slug]/team/page.tsx']) {
    it(tela, () => {
      const t = ler(tela)
      expect(t).toMatch(/configDeComissaoDaRede\(ctx\.tenantId!\)/)
      expect(t).toMatch(/<ComissaoDoMembro[\s\S]*?vendaDaRede=\{vendaDaRede\}/)
    })
  }
})
