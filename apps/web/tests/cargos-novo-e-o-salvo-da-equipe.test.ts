import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WEB = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

/**
 * A13 da 34ª simulação (design.md, o realce do selecionado; princípio 7):
 * em Cargos → Novo, o cargo que estava aberto seguia realçado na lista
 * enquanto se digitava o nome do novo — parecia que o novo nascia dele. Com o
 * formulário do novo aberto, o selecionado é o novo (o próprio formulário, com
 * a borda da marca); nenhum cartão da lista fica realçado.
 */
describe('A13: Cargos → Novo, o novo é o selecionado', () => {
  it('com o formulário do cargo novo aberto, nenhum cartão da lista fica realçado', () => {
    const tela = ler('components/admin/roles-editor.tsx')
    expect(tela).toMatch(/selected=\{!showForm && role\.id === selectedId\}/)
  })
})

/**
 * A15 da 34ª simulação (§11: a Admin da rede não muda o próprio cargo;
 * princípio 7): na Equipe, a própria Admin via o seletor de cargo desligado
 * sem o motivo (ele morava na dica, escondido), e o Salvar fechava a janela sem
 * retorno. A recusa curta fica à vista junto do seletor desligado (mensagem de
 * recusa, não explicação), e o salvar diz "Salvo.", como as outras telas.
 */
describe('A15: a Equipe, a própria Admin da rede', () => {
  const tela = () => ler('components/admin/team-member-edit.tsx').replace(/\r/g, '')

  it('o seletor do cargo travado diz à vista por que está desligado', () => {
    const t = tela()
    const fixo = t.slice(t.indexOf('{cargoFixo ? (\n                    <>'), t.indexOf(') : cargoTravado ? (\n                    <>'))
    expect(fixo).toMatch(/<select id=\{`tme-role-\$\{member\.id\}`\} className="field" value=\{cargoFixo\.id\} disabled>/)
    expect(fixo).toMatch(/<p data-cargo-fixo[^>]*>[\s\S]*Você não muda o próprio cargo de \{cargoFixo\.label\}/)
  })

  it('salvar sem aviso confirma com "Salvo."', () => {
    expect(tela()).toMatch(/if \(avisoAoSalvar\) toast\.warning\(avisoAoSalvar\)\s*else toast\.success\('Salvo\.'\)/)
  })
})
