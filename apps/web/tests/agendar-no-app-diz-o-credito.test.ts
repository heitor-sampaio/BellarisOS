import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { textoDoCreditoNoConfirmar } from '@/lib/clientes/textos-do-app'

/**
 * A6 da 31ª simulação (princípio 3): a Tânia tinha R$ 200 de crédito, e o
 * Confirmar do agendamento não dizia nada dele. O crédito interno é FORMA DE
 * PAGAMENTO (CI-04: "Pagar com crédito interno desconta do saldo"): agendar não
 * o usa. A tela diz quando ele vale — no pagamento.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('A6: o Confirmar do app diz quando o crédito interno é usado', () => {
  it('o texto diz o saldo e que é no pagamento, não no agendar', () => {
    const t = textoDoCreditoNoConfirmar({ rotulo: 'Crédito em Studio Ixora', saldo: 'R$ 200,00' })
    expect(t).toBe('Crédito em Studio Ixora: R$ 200,00. Agendar não usa o crédito: ele pode pagar este atendimento na hora do pagamento.')
  })
  it('a página passa o saldo (lib/metrics) e o Confirmar mostra, sem o "já pago"', () => {
    const pagina = fonte('app/[slug]/cliente/agendamentos/novo/page.tsx')
    expect(pagina).toMatch(/getCreditoInternoDoCliente\(/)
    expect(pagina).toMatch(/creditoInterno=\{/)
    const wizard = fonte('components/client-portal/new-appointment-wizard.tsx')
    const confirmar = wizard.slice(wizard.indexOf('Step 4: Confirmar'))
    expect(confirmar).toMatch(/data-credito-no-confirmar/)
    expect(confirmar).toMatch(/!procedure\.jaPago && creditoInterno > 0/)
    expect(confirmar).toMatch(/textoDoCreditoNoConfirmar\(/)
  })
})
