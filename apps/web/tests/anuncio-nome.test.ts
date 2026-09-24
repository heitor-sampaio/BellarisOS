import { describe, it, expect } from 'vitest'
import { nomeDoAnuncio, type RotulavelComoAnuncio } from '@/lib/ads/rotulo'

/**
 * Como o selo chama o anúncio.
 *
 * O defeito que isto guarda foi relatado olhando a tela: o selo dizia
 * **"Anúncio: Fale conosco"**. O `headline` do aviso do WhatsApp é o texto do
 * BOTÃO — vem "Fale conosco" em 109 de 109 mensagens reais —, e chamar o
 * anúncio assim identifica coisa nenhuma: dois criativos diferentes da mesma
 * campanha têm o mesmo botão.
 */

const base: RotulavelComoAnuncio = { adName: null, creativeName: null, body: null }

describe('nomeDoAnuncio', () => {
  it('o botão NUNCA vira o nome do anúncio', () => {
    // O caso que motivou a correção.
    expect(nomeDoAnuncio(base)).toBeNull()
    expect(nomeDoAnuncio({ ...base, body: 'Texto' })).toBe('Texto')
  })

  it('prefere o nome que o gestor deu ao anúncio', () => {
    expect(nomeDoAnuncio({
      ...base, adName: 'Coxilha 10-12/out', creativeName: 'Criativo A', body: 'Texto',
    })).toBe('Coxilha 10-12/out')
  })

  it('sem ele, o nome do criativo', () => {
    expect(nomeDoAnuncio({ ...base, creativeName: 'Criativo A', body: 'Texto' })).toBe('Criativo A')
  })

  it('sem a Meta conectada, a primeira linha do criativo — que é o que a pessoa leu', () => {
    const body = 'SEU 4X4 FOI FEITO PARA MAIS!\n\nDe 10 a 12 de outubro...'
    expect(nomeDoAnuncio({ ...base, body })).toBe('SEU 4X4 FOI FEITO PARA MAIS!')
  })

  it('pula linhas vazias no começo do criativo', () => {
    expect(nomeDoAnuncio({ ...base, body: '\n\n  \nPrimeira de verdade\noutra' }))
      .toBe('Primeira de verdade')
  })

  it('corta a primeira linha quando ela é um parágrafo inteiro', () => {
    // Criativo sem quebra de linha é comum, e o selo tem uma linha só.
    const longo = 'a'.repeat(200)
    const r = nomeDoAnuncio({ ...base, body: longo })!
    expect(r.length).toBeLessThanOrEqual(61)
    expect(r.endsWith('…')).toBe(true)
  })

  it('sem nada, é nulo — e aí o selo mostra o id', () => {
    // O id é o último fio para achar o anúncio no gerenciador; inventar um
    // nome seria pior.
    expect(nomeDoAnuncio({ ...base, body: '   ' })).toBeNull()
  })
})
