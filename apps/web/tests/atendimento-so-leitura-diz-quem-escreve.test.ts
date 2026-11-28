import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDeQuemEscreveOClinico } from '@/lib/equipe/textos-de-quem-pode'

/**
 * A1 da 41ª (AT-05: "diz quem faz, pela permissão e com os nomes"): a faixa de
 * quem tem o Prontuário só em Ver ("Só para ler: … pede o Prontuário em
 * Gerenciar.") não dizia QUEM escreve; as outras faixas da tela dizem os nomes
 * (`textoDeQuemConclui`, `textoDeQuemMarcaAChegada`). Os nomes são os de quem
 * tem o Prontuário em Gerenciar ao alcance da unidade (`quemRespondeAFichaDeSaude`).
 */
describe('a faixa do clínico só para ler diz quem escreve', () => {
  it('com os nomes, na mesma forma das outras faixas', () => {
    expect(textoDeQuemEscreveOClinico(['Valquíria', 'Marluce'])).toBe('Quem escreve: Valquíria e Marluce.')
    expect(textoDeQuemEscreveOClinico(['Valquíria'])).toBe('Quem escreve: Valquíria.')
  })

  it('sem nomes, não acrescenta nada (a permissão já está dita)', () => {
    expect(textoDeQuemEscreveOClinico([])).toBe('')
    expect(textoDeQuemEscreveOClinico(null)).toBe('')
  })

  it('a tela põe os nomes na faixa', () => {
    const tela = readFileSync(join(__dirname, '..', 'components/branch/appointment-session.tsx'), 'utf8')
    const i = tela.indexOf('data-clinico-so-leitura role="note"')
    const faixa = tela.slice(i, tela.indexOf('</p>', i))
    expect(faixa).toContain('{TEXTO_DO_CLINICO_SO_LEITURA}')
    expect(faixa).toContain('textoDeQuemEscreveOClinico(quemRespondeAFicha)')
  })
})
