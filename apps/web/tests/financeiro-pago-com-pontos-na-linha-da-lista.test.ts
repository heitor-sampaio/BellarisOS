import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// PD-03: o que se paga com pontos ou voucher "aparece à parte … 'Pago com pontos: …' na linha". O D10 da 42ª
// simulação levou isso à linha da FICHA também quando há dinheiro junto; a lista do Financeiro (da unidade e da
// rede) seguia dizendo só no pagamento de R$ 0 (o `pagosSemDinheiro`, que também decide o "Desfazer o
// pagamento" e fica). Princípio 3: a mesma linha diz a mesma coisa nas três telas. Com o programa desligado,
// nada (fidelidade.md). Achado na revisão da 42ª; decisão do Claude, 28/11.
const fonte = (arq: string) => readFileSync(path.join(__dirname, '..', arq), 'utf8')

describe('PD-03: a lista do Financeiro diz "Pago com pontos" também com dinheiro junto', () => {
  for (const pagina of ['app/[slug]/financeiro/page.tsx', 'app/admin/financeiro/page.tsx']) {
    it(`${pagina}: lê o pago com pontos/voucher de todo recebimento, só com o programa ligado`, () => {
      const t = fonte(pagina)
      expect(t).toMatch(/pagosComFidelidade\(/)
      expect(t).toMatch(/configDaRede\(/)
      expect(t).toMatch(/pago_com_fidelidade:/)
    })
  }

  for (const tela of ['components/branch/financial-table.tsx', 'components/admin/admin-financial-view.tsx']) {
    it(`${tela}: mostra o texto embaixo da forma`, () => {
      const t = fonte(tela)
      expect(t).toMatch(/pago_com_fidelidade\?: string \| null/)
      expect(t).toMatch(/data-pago-com-fidelidade/)
    })
  }
})
