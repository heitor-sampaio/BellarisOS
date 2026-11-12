import { describe, it, expect } from 'vitest'
import { fichaDaOportunidadeImportada } from '@/lib/crm/ficha-do-telefone'

/**
 * C5 do levantamento das regras (F70; D11): a importação de CONTATOS com
 * oportunidade criava o card sem a ficha, mesmo com o telefone de uma cliente
 * — o "Novo lead" da tela pergunta "É a mesma pessoa?", a importação não tem a
 * quem perguntar. Uma ficha ativa com o telefone: o card nasce ligado a ela.
 * Mais de uma: não escolhe (princípio 4) e o relatório da linha diz.
 */
describe('a ficha da oportunidade importada', () => {
  it('nenhuma ficha com o telefone: sem ficha, sem aviso', () => {
    expect(fichaDaOportunidadeImportada([])).toEqual({ clientId: null, aviso: null })
  })
  it('uma ficha ativa: a oportunidade nasce ligada a ela', () => {
    expect(fichaDaOportunidadeImportada([{ id: 'c1', nome: 'Camila Duarte' }])).toEqual({ clientId: 'c1', aviso: null })
  })
  it('mais de uma: não escolhe, e avisa', () => {
    const r = fichaDaOportunidadeImportada([{ id: 'c1', nome: 'Camila Duarte' }, { id: 'c2', nome: 'Camila D.' }])
    expect(r.clientId).toBeNull()
    expect(r.aviso).toBe('O telefone é de mais de uma ficha (Camila Duarte, Camila D.): a oportunidade nasceu sem ficha.')
  })
})
