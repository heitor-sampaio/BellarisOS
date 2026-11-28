import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Intuitivo não é explicativo (o Heitor, 2026-11-26: "isso não é ser intuitivo,
 * é ser explicativo e não isso que eu quero."; CLAUDE.md, princípio 7).
 *
 * A dica do aviso do rascunho ("A ficha de saúde, a evolução e a ficha digitadas
 * ficam guardadas só nesta aba até o 'Finalizar atendimento'") explicava a tela
 * e ficou errada com o "Salvar evolução" (CLAUDE.md §11: quem tem o Prontuário em
 * Gerenciar salva a evolução no andamento). Sai a dica; o aviso curto do risco
 * fica (tests/atendimento-crm-atritos-da-21).
 */
const tela = readFileSync(join(__dirname, '..', 'components/branch/appointment-session.tsx'), 'utf8')

describe('o aviso do rascunho no atendimento', () => {
  it('não tem a dica que explica onde fica o digitado', () => {
    expect(tela).not.toContain('Sobre o que se digita aqui')
    expect(tela).not.toContain('ficam guardadas só nesta aba')
  })

  it('o aviso curto do risco continua', () => {
    expect(tela).toContain('Fica só nesta aba: fechar a aba antes do “Finalizar atendimento” perde o que foi digitado.')
  })
})
