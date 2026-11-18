import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { rotuloDaComissaoDoPacote } from '@/lib/comissoes/config'

const ler = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')

/**
 * A4 da 25ª simulação (princípio 3): no pacote, a "Comissão de venda" dizia
 * "Nenhuma" e o resumo dizia "a regra de quem vendeu" — as duas coisas da
 * mesma escolha. Sem regra no pacote, vale a comissão de venda de quem
 * vendeu (A17 da 11ª; comissoes.md, "O 'De venda' do pacote diz que vence"):
 * a opção se chama pelo que acontece.
 */
describe('A4: a comissão de venda do pacote sem regra própria diz a mesma coisa nos dois lugares', () => {
  it('a opção é "A de quem vendeu", não "Nenhuma"', () => {
    const t = ler('components/admin/pacotes-catalogo.tsx')
    const i = t.indexOf('const VENDAS = [')
    const vendas = t.slice(i, t.indexOf(']', i))
    expect(vendas).toMatch(/\{ key: 'NENHUMA',\s+label: 'A de quem vendeu' \}/)
    expect(vendas).not.toMatch(/'Nenhuma'/)
  })
  it('o resumo diz o mesmo', () => {
    expect(rotuloDaComissaoDoPacote({ venda: null, execucao: { tipo: 'REGRA', valor: null } }))
      .toBe('Venda: a de quem vendeu · Execução: regra de cada profissional')
  })
})
