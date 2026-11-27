import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resumoDoEditorDeHorario, diasQueValem } from '@/lib/unidades/horario-no-editor'
import type { Horario } from '@/lib/agenda/horario'

/**
 * O horário próprio de quem atende vale só dentro do da unidade (AG-10, AG-64).
 * O Lauro marcou 07:00 com a unidade abrindo às 08:00, e o "Fica assim:" dizia
 * 07:00 — uma regra escondida (princípio 3). Para quem é de uma unidade só (ou
 * da rede, com a rede de uma unidade), o resumo diz o que vale: o cruzamento.
 * Sem frase nova (princípio 7): é o mesmo "Fica assim:", com o número certo.
 */

const SEG_A_SAB = (de: string, ate: string) => Object.fromEntries(['1', '2', '3', '4', '5', '6'].map(d => [d, [{ de, ate }]]))
const unidade: Horario = { dias: { ...SEG_A_SAB('08:00', '18:00'), '0': [] } }
const dele = { ...SEG_A_SAB('07:00', '12:00'), '0': [] }

describe('o resumo do horário próprio diz o que vale', () => {
  it('com a unidade, o resumo é o cruzamento (07:00 vira 08:00)', () => {
    expect(resumoDoEditorDeHorario(diasQueValem(dele, unidade))).toBe('Fica assim: Seg a sáb, 08:00–12:00. Domingo fechado')
  })

  it('o período todo fora da unidade fecha o dia', () => {
    const tarde = { ...dele, '3': [{ de: '19:00', ate: '21:00' }] }
    expect(diasQueValem(tarde, unidade)['3']).toEqual([])
  })

  it('sem a unidade (várias unidades), o resumo é o que ela marcou', () => {
    expect(diasQueValem(dele, null)).toBe(dele)
  })

  it('o editor e a Equipe passam a unidade só quando ela é uma', () => {
    const editor = readFileSync(path.resolve(__dirname, '../components/shared/editor-de-horario.tsx'), 'utf8')
    expect(editor).toMatch(/resumoDoEditorDeHorario\(diasQueValem\(comAMeiaNoite\(dias\), dentroDe/)
    const equipe = readFileSync(path.resolve(__dirname, '../components/admin/team-member-edit.tsx'), 'utf8')
    expect(equipe).toMatch(/dentroDe=\{/)
  })
})
