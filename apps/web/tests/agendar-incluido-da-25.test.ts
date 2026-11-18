import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { textoDoCreditoAoAgendar } from '@/lib/creditos/texto-do-pago'

const ler = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')

/**
 * A3 da 25ª simulação (princípio 3): a sessão do plano recebido no crediário
 * aparecia como "Já pago" ao agendar — com parcelas em aberto. O app já dizia
 * "Incluído" (A10/A17 da 15ª) e a janela da agenda também (A21 da 21ª); o
 * agendar da equipe (a agenda, o inbox e o cartão do Copilot) ficou com o
 * "Já pago". Agora: "Incluído", e o texto diz de onde vem — a sessão do plano
 * dizia "Incluído no pré-pago de …" (o PLANO caía no texto do pré-pago).
 */
describe('A3: o agendar diz "Incluído", não "Já pago"', () => {
  it('o texto do crédito diz de onde vem, também o do plano', () => {
    expect(textoDoCreditoAoAgendar({ tipo: 'PLANO', origem: 'Plano de tratamento', procedimento: 'Peeling', numero: 2, total: 6 }))
      .toBe('Incluído no plano de tratamento (sessão 2 de 6)')
    expect(textoDoCreditoAoAgendar({ tipo: 'PACOTE', origem: '4 lasers', procedimento: 'Laser', numero: 1, total: 4 }))
      .toBe('Incluído no pacote 4 lasers (sessão 1 de 4)')
  })
  it('a agenda, o inbox e o Copilot não dizem "Já pago"', () => {
    const modal = ler('components/branch/appointment-modal.tsx')
    expect(modal).not.toMatch(/label="Já pago"|Já pago:|— já pago/)
    expect(modal).toMatch(/textoDoCreditoAoAgendar\(credito\)/)
    expect(ler('components/admin/inbox-lead-panel.tsx')).not.toMatch(/>Já pago</)
    expect(ler('lib/copilot/ferramentas/agenda-escrita.ts')).not.toMatch(/rotulo: 'Já pago'/)
    for (const f of ['components/branch/appointment-modal.tsx', 'components/admin/inbox-lead-panel.tsx']) {
      expect(ler(f), f).not.toMatch(/aria-label="Usar o que já foi pago"/)
    }
  })
})
