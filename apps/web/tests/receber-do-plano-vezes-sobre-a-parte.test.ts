import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Princípio 3 ("O que a tela mostra é o que vale na conta"): no Receber do plano dividido em "+ Outra forma",
// o cartão da 1ª forma leva só a parte dele (o que falta das outras). As vezes ("2x de R$ …") e a taxa da
// maquininha saíam sobre o plano inteiro (`liquido`), sem tirar as outras formas, os pontos e o voucher —
// como já fazem `campos-do-pagamento` (`pagaAgora`) e `outras-formas` (o valor da parte). Achado na revisão da
// 42ª simulação (o mesmo vício do A2); decisão do Claude, 28/11.
describe('o Receber do plano: as vezes e a taxa do cartão sobre a parte da 1ª forma', () => {
  const fonte = readFileSync(path.join(__dirname, '..', 'components/branch/checkout-wizard.tsx'), 'utf8')
  const totais = (comp: string) =>
    [...fonte.matchAll(new RegExp(`<${comp}\\b[^>]*?\\btotal=\\{([^}]*)\\}`, 'g'))].map(m => m[1]!.trim())

  for (const comp of ['DicaDasVezes', 'AvisoDaTaxa']) {
    it(`${comp}: a parte da 1ª forma, não o plano inteiro`, () => {
      const v = totais(comp)
      expect(v.length).toBeGreaterThan(0)
      for (const x of v) {
        expect(x, `o total do ${comp}`).not.toMatch(/\bliquido\b/)
        expect(x, `o total do ${comp}`).toMatch(/\bnaPrimeiraForma\b/)
      }
    })
  }
})
