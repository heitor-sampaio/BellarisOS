import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planoFechado } from '@/lib/plano-de-tratamento/fechado'

/**
 * D6 da 35ª: o plano PROPOSTO não se editava na tela — `isPlanLocked` o
 * travava junto do fechado —, e a Dra. Talita cancelou e refez o proposto de
 * R$ 1.100. PL-02 (o Heitor, 2026-11-23, UM3: quem monta "edita, propõe…") e
 * PL-15 (só o plano FECHADO não se altera): o editor trava pela mesma regra do
 * servidor (`planoFechado`). O proposto se edita onde o editor salva pelo
 * plano (a página do plano, a ficha e o Planejamento — `onSalvarPorPlano`); o
 * cartão "Tratamento" da avaliação, que salva como rascunho da avaliação, segue
 * só mostrando o proposto (o aceite dele mora no cartão "A cliente vai pensar").
 */

const editor = () => readFileSync(join(__dirname, '..', 'components', 'branch', 'treatment-plan-editor.tsx'), 'utf8')

describe('D6: o proposto se edita', () => {
  it('o servidor não trava o proposto', () => {
    expect(planoFechado('PROPOSED')).toBe(false)
    expect(planoFechado('ACCEPTED')).toBe(true)
  })
  it('o editor trava pelo fechado, não pelo proposto', () => {
    const linha = editor().split('\n').find(l => l.includes('const isPlanLocked ='))!
    expect(linha).toMatch(/planoFechado\(existingPlan\?\.status\)/)
    expect(linha).not.toMatch(/\['PROPOSED', 'ACCEPTED'/)
    expect(linha).toMatch(/existingPlan\?\.status === 'PROPOSED' && !onSalvarPorPlano/)
  })
})
