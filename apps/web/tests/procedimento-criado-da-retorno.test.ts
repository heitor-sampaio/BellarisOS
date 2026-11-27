import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A14 da 35ª simulação (princípio 7; decisão do Claude, 27/11): em
 * Procedimentos → Novo, ao criar, a janela fechava na hora e o "Procedimento
 * criado com sucesso." do formulário nunca aparecia — nenhum retorno. O retorno
 * da ação é o das outras telas: o aviso ("toast") ao fechar, com o nome.
 */
const modal = readFileSync(join(__dirname, '..', 'components', 'admin', 'procedure-modal.tsx'), 'utf8')

describe('A14: criar o procedimento dá retorno', () => {
  it('o sucesso avisa ao fechar a janela, criado ou salvo', () => {
    const sucesso = modal.slice(modal.indexOf('function handleSuccess'), modal.indexOf('function handleSuccess') + 400)
    expect(sucesso).toMatch(/toast\.success\(/)
    expect(sucesso).toMatch(/Procedimento criado/)
    expect(sucesso).toMatch(/Procedimento salvo/)
    expect(modal).toMatch(/import \{ toast \} from 'sonner'/)
  })
})
