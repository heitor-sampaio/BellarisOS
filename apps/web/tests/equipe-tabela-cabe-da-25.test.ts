import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A13 (parte 2) da 25ª simulação (princípio 7; docs/regras/design.md, "Tabela
 * com coluna de ações cabe no cartão"): em /admin/team a 1440 px a última
 * coluna cortava — o chip da comissão ("Venda: a do pacote, produto ou re…"),
 * o "Desativar" e, na linha da Admin, o "Cargo e unidade". Os chips são
 * `white-space: nowrap` (globals.css): o texto longo de um chip fazia dele a
 * largura mínima da coluna, e a do "Atende em A e B" espremia as ações.
 *
 * A regra: o texto longo QUEBRA, até duas linhas (`-webkit-line-clamp`), com
 * o limite de largura num `span` de dentro e o texto inteiro no `title`.
 */
const WEB = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

describe('A13(2): a tabela da Equipe cabe no cartão', () => {
  it('o chip da comissão (o mesmo nas duas telas) quebra em até duas linhas, com o texto inteiro no title', () => {
    const fonte = ler('components/admin/comissao-do-membro.tsx')
    const chip = fonte.slice(fonte.indexOf('data-comissao={membro.id}') - 600, fonte.indexOf('<dialog'))
    expect(chip).toMatch(/title=\{`\$\{textoDoChip\}/)
    expect(chip).toMatch(/<span data-texto-do-chip style=\{\{[^}]*whiteSpace: 'normal'[^}]*WebkitLineClamp: 2[^}]*maxWidth: \d+/)
  })
  it('o selo "Atende em …" da rede também, e os chips do cargo quebram a linha', () => {
    const fonte = ler('app/admin/team/page.tsx')
    expect(fonte).toMatch(/<div data-cargo-do-membro style=\{\{ display: 'flex', flexWrap: 'wrap'/)
    const atende = fonte.slice(fonte.indexOf('data-atende-em'), fonte.indexOf('data-atende-em') + 600)
    expect(atende).toMatch(/title=\{selo\(m\)/)
    expect(atende).toMatch(/WebkitLineClamp: 2[^}]*maxWidth: \d+/)
  })
  it('as ações quebram a linha nas duas telas (nunca nowrap)', () => {
    for (const tela of ['app/admin/team/page.tsx', 'app/[slug]/team/page.tsx']) {
      const fonte = ler(tela)
      expect(fonte, tela).toMatch(/data-acoes-do-membro style=\{\{ display: 'flex', flexWrap: 'wrap'/)
      const acoes = fonte.slice(fonte.indexOf('data-acoes-do-membro'), fonte.indexOf('data-acoes-do-membro') + 300)
      expect(acoes, tela).not.toMatch(/nowrap/)
    }
  })
})
