import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O painel do inbox (`inbox-lead-panel.tsx`), com o mesmo defeito que o card
 * do quadro tinha:
 *
 * - crm-inbox:TG-10 (as tags da ficha e do contato se juntam ao ligar) e
 *   princípio 3: o "Cadastrar como cliente" do inbox abria os chips de tag
 *   DESMARCADOS, mas a ficha nasce com as tags do contato (a conversa liga a
 *   ficha ao contato). Como no quadro, as tags da pessoa abrem marcadas e
 *   fixas — e o formulário diz que vêm do CONTATO, não da oportunidade.
 * - princípio 3: o campo de valor do painel dizia "Valor negociado"; o card e a
 *   janela da oportunidade o chamam "Valor estimado" (o mesmo `leads.value`).
 */
const fonte = (r: string) => readFileSync(join(__dirname, '..', r), 'utf8')
const painel = fonte('components/admin/inbox-lead-panel.tsx')
const formulario = fonte('components/branch/client-form.tsx')

describe('TG-10: o cadastro do inbox mostra as tags que a ficha vai receber', () => {
  it('o painel manda as tags do contato no prefill, dizendo que vêm do contato', () => {
    const cadastro = painel.slice(painel.indexOf('<ClientForm'), painel.indexOf('<ClientForm') + 1200)
    expect(cadastro).toMatch(/prefill=\{\{[^}]*tags,[^}]*tagsDe: 'contato'/)
  })
  it('o formulário diz de onde as tags vêm (o contato ou a oportunidade)', () => {
    expect(formulario).toMatch(/tagsDe\?: 'oportunidade' \| 'contato'/)
    expect(formulario).toContain("prefill?.tagsDe === 'contato' ? 'do contato' : 'da oportunidade'")
  })
})

describe('princípio 3: o valor do painel tem o nome do card', () => {
  it('"Valor estimado", não "Valor negociado"', () => {
    expect(painel).not.toContain('Valor negociado')
    expect(painel).toContain('placeholder="Valor estimado"')
  })
})
