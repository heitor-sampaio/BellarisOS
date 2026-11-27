import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * D15 da 35ª simulação (CQ-13; comissoes.md, "a de VENDA volta na proporção do
 * que foi cancelado"; princípio 3): a dica da comissão de venda de plano dizia
 * "Se o plano for cancelado, ela volta.", e a comissão cai NA PROPORÇÃO do
 * cancelado (52 → 9 na A03). O texto que contraria a conta se corrige pelo
 * texto certo e curto.
 */
const TELA = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'admin', 'settings-comissoes.tsx'), 'utf8')

describe('D15: a dica da venda de plano diz o que a conta faz no cancelamento', () => {
  it('não diz que a comissão "volta" inteira', () => {
    expect(TELA).not.toContain('Se o plano for cancelado, ela volta.')
  })
  it('diz que ela cai na proporção do cancelado', () => {
    expect(TELA).toContain('Se o plano for cancelado, ela cai na proporção do cancelado.')
  })
})
