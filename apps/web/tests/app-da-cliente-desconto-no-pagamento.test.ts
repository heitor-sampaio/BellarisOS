import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O pago com desconto mostra no app o valor COBRADO e o desconto (AG-56 do
 * catálogo do Atendimento; princípio 3). D7 da 39ª: a Evangelina pagou 162
 * (Pix 100 + Débito 62) com R$ 18 de desconto, e o Financeiro do app dizia só
 * os valores — o desconto e o motivo moram no lançamento (`sale_discount`,
 * `desconto_motivo`), e a consulta do app não os lia. O texto é o mesmo da
 * equipe e do recibo que ela baixa (`descontosDosLancamentos`): "Desconto
 * R$ 18,00 · aniversário".
 */

const WEB = join(__dirname, '..')
const ler = (p: string) => readFileSync(join(WEB, p), 'utf8')

describe('o desconto do que ela pagou, no app', () => {
  for (const pagina of ['app/[slug]/cliente/financeiro/page.tsx', 'app/[slug]/cliente/historico/page.tsx']) {
    it(`${pagina}: lê o desconto e o motivo do lançamento e monta o texto pelo lugar único`, () => {
      const fonte = ler(pagina)
      expect(fonte).toMatch(/financial_transactions[\s\S]*sale_discount[\s\S]*desconto_motivo/)
      expect(fonte).toMatch(/descontosDosLancamentos\(/)
    })
  }

  it('o Financeiro do app mostra o desconto embaixo do lançamento', () => {
    expect(ler('app/[slug]/cliente/financeiro/page.tsx')).toMatch(/data-desconto-do-lancamento/)
  })

  it('o Histórico → Pagamentos do app mostra o desconto embaixo do pagamento', () => {
    expect(ler('components/client-portal/historico-tabs.tsx')).toMatch(/data-desconto-do-lancamento/)
  })
})
