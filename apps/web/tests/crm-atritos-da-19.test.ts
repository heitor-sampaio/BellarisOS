import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A23 e A31 da 19ª simulação (2026-11-16), o CRM.
 *
 * A23 [7]: excluir uma etapa do funil não confirmava — o A11 da 17ª pedia o
 * "sim" só na última etapa de perda. Toda exclusão de etapa pergunta antes; a
 * última de perda diz também que o funil fica sem perda.
 * A31 [3]: "Escolha o motivo da perda para salvar." já aparecia em vermelho ao
 * escolher a etapa Perdido, antes de a pessoa tentar salvar. Fica neutro até o
 * salvar barrar.
 */

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('A23: excluir a etapa pergunta antes', () => {
  it('o texto da pergunta', async () => {
    const { perguntaAoExcluirEtapa } = await import('@/lib/crm')
    expect(perguntaAoExcluirEtapa('Em negociação', false)).toBe('Excluir a etapa “Em negociação”? Não dá para desfazer.')
    expect(perguntaAoExcluirEtapa('Perdido', true)).toBe(
      'Este funil fica sem etapa de perda: o “Marcar como perdido” e os motivos de perda não terão para onde levar a oportunidade.')
  })
  it('a linha da etapa sempre pede o "sim" antes de excluir', () => {
    const f = fonte('components/branch/crm-stage-settings.tsx')
    const excluir = f.slice(f.indexOf('async function handleDelete'), f.indexOf('return (', f.indexOf('async function handleDelete')))
    expect(excluir).toMatch(/if \(!confirmado\)/)
    expect(excluir).not.toMatch(/ultimaDePerda && !confirmado/)
    expect(f).toMatch(/perguntaAoExcluirEtapa\(/)
  })
})

describe('A31: o lembrete do motivo fica neutro até tentar salvar', () => {
  it('o campo marca a tentativa (onInvalid) e só então fica vermelho', () => {
    const f = fonte('components/branch/pergunta-da-perda.tsx')
    const campos = f.slice(f.indexOf('export function MotivoDaPerdaCampos'))
    expect(campos).toMatch(/onInvalid=/)
    const lembrete = campos.slice(campos.indexOf('{lembrete && !motivoId'), campos.indexOf('</label>'))
    expect(lembrete).toContain('Escolha o motivo da perda para salvar.')
    expect(lembrete).toMatch(/tentou \? 'var\(--danger\)' : 'var\(--text-muted\)'/)
  })
})
