import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { regraDosCamposDoFechamento } from '@/lib/financeiro/conferencia-do-fechamento'

const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/**
 * vendas-financeiro.md, "Fechamento do dia": "O Dinheiro é obrigatório (em
 * branco = R$ 0 quando não houve dinheiro, A50); as outras formas são
 * OPCIONAIS — em branco é 'não conferido'". A7 da 31ª (princípio 3): no dia
 * sem espécie, a célula dizia "em branco é R$ 0,00" e o rodapé "O dinheiro é
 * obrigatório" — duas regras na mesma tela. O rodapé diz a do dia.
 */
describe('o rodapé do Fechamento do dia diz uma regra só para o dinheiro', () => {
  it('com dinheiro no dia: o dinheiro é obrigatório', () => {
    expect(regraDosCamposDoFechamento(false))
      .toBe('O dinheiro é obrigatório. As outras formas são opcionais: em branco, a linha fica “não conferido”.')
  })
  it('sem espécie no dia: o dinheiro em branco fecha em R$ 0,00', () => {
    expect(regraDosCamposDoFechamento(true).replace(/ /g, ' '))
      .toBe('Sem dinheiro em espécie hoje: o dinheiro em branco fecha em R$ 0,00. As outras formas são opcionais: em branco, a linha fica “não conferido”.')
  })
  it('a tela usa a regra do dia no rodapé', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('regraDosCamposDoFechamento(semDinheiro)')
  })
})
