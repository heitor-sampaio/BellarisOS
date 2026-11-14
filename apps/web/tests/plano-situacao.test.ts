import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { SITUACAO_DO_PLANO, situacaoDoPlano } from '@/lib/plano-de-tratamento/situacao'

/**
 * J-37 (ajustes J, 2026-10-30): o mesmo status PROPOSED tinha dois nomes —
 * "Aguardando aceite" (Planejamentos, a tela do plano) e "Aguardando checkout"
 * (o editor, o dashboard, a tela do atendimento). O nome é UM, e mora num
 * lugar só; as telas que mostram a situação do plano o leem de lá.
 */

const WEB = path.resolve(__dirname, '..')
const TELAS = [
  'components/branch/planejamento-tratamento.tsx',
  'components/branch/planejamentos-client.tsx',
  'components/branch/treatment-plan-editor.tsx',
  'components/branch/treatment-file-modal.tsx',
]

describe('a situação do plano de tratamento', () => {
  // PT1a (Bloco Plano de tratamento, 2026-11-14): o aceite não é mais o
  // checkout (a comanda vai ao PDV) — o proposto é "Proposto", o nome do PT1f.
  it('PROPOSED é "Proposto"', () => {
    expect(SITUACAO_DO_PLANO.PROPOSED!.label).toBe('Proposto')
    expect(situacaoDoPlano('PROPOSED').label).toBe('Proposto')
  })

  it('o plano fechado no checkout é "Fechado" em toda tela', () => {
    expect(situacaoDoPlano('ACCEPTED').label).toBe('Fechado')
  })

  it('status desconhecido não quebra a tela', () => {
    expect(situacaoDoPlano('QUALQUER').label).toBe('QUALQUER')
  })

  it.each(TELAS)('%s lê o nome de lib/plano-de-tratamento/situacao, sem um nome próprio', arquivo => {
    const texto = fs.readFileSync(path.join(WEB, arquivo), 'utf8')
    expect(texto).not.toMatch(/Aguardando aceite/)
    expect(texto).not.toMatch(/PROPOSED:\s*\{\s*label/)
    expect(texto).toMatch(/@\/lib\/plano-de-tratamento\/situacao/)
  })
})
