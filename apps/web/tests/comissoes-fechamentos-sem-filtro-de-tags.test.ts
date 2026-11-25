import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Financeiro → Comissões com o filtro de tags marcado (princípio 3): o
 * extrato recorta pela tag da cliente, mas "Últimos fechamentos" não muda —
 * um fechamento é da pessoa inteira, de todas as clientes. A explicação
 * estava só na dica do filtro; o quadro dos fechamentos não dizia nada, e
 * parecia que o filtro valia ali. Com tag marcada, o título do quadro diz
 * "sem o filtro de tags", e a dica ao lado diz por quê.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

describe('os Últimos fechamentos dizem que o filtro de tags não os recorta', () => {
  const tela = ler('components/shared/financeiro-comissoes.tsx')
  const quadro = tela.slice(tela.indexOf('aria-label="Fechamentos"'), tela.indexOf('p.fechamentos.map('))

  it('com tag marcada, o título diz "sem o filtro de tags"', () => {
    expect(quadro).toMatch(/tags\.length > 0 &&[\s\S]*data-fechamentos-sem-tags[\s\S]*sem o filtro de tags/)
  })

  it('e a dica diz por quê', () => {
    expect(quadro).toContain('<Dica rotulo="Sobre os fechamentos e as tags">')
    expect(quadro).toContain('O fechamento é da pessoa inteira, com as comissões de todas as clientes: a tag não o recorta.')
  })
})
