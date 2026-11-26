import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O número do dashboard da rede e dos Relatórios é o da conta, desde o primeiro
 * quadro (princípio 3: "O que a tela mostra é o que vale na conta"; §13.1).
 *
 * D3 da 31ª: o "Giro do mês" do painel da rede deu R$ 14,10 a uma pessoa e
 * R$ 12,53 e R$ 12,70 a outra, no mesmo momento — e R$ 12,53 não era a soma de
 * baixa nenhuma. A conta (`metrics_giro_estoque`) é uma só e não recorta por
 * quem olha (com "A rede inteira" e o Financeiro, a vista pessoal não entra): o
 * número subia de R$ 0,00 até o valor em 0,9 s (`useCountUp`), e quem olhou no
 * meio leu um valor que não existe. O servidor desenhava R$ 0,00. O design
 * system já diz "Sem animações de entrada" (skill lumiere-design, readme).
 * Decisão do Claude, 26/11: o número aparece com o valor dele, sem contagem.
 */

const fonte = (arq: string) => readFileSync(path.resolve(__dirname, '..', arq), 'utf8')

describe('D3: o número aparece com o valor da conta, sem contagem de 0 até ele', () => {
  for (const arq of ['components/admin/admin-dashboard-view.tsx', 'components/admin/reports-bi-view.tsx']) {
    it(`${arq}: nenhum número conta de 0 até o valor`, () => {
      const t = fonte(arq)
      expect(t, 'a contagem animada mostrava valores que não existem').not.toMatch(/useCountUp/)
      expect(t).not.toMatch(/requestAnimationFrame/)
    })
  }
})
