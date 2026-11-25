import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * PR-07 ("o 'Estornar' oferece 'Devolver só parte da venda'") e EX-02 ("sempre
 * com a mesma janela"): o estorno da venda de produto pela ficha, pela comanda
 * do PDV e pela página do atendimento passa por `AcoesDoLancamentoDaFicha`, e
 * só os dois financeiros davam à janela o "Devolver só parte da venda" — a
 * cliente que devolveu 1 de 3 tinha de estornar as 3 e vender 2 de novo.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

describe('o estorno da venda de produto fora do Financeiro oferece "Devolver só parte da venda"', () => {
  const acoes = ler('components/shared/acoes-do-lancamento-da-ficha.tsx')

  it('a janela do estorno ganha o caminho da devolução de parte na venda de produto', () => {
    expect(acoes).toMatch(/onDevolverParte=\{l\.vendaDeProduto/)
  })

  it('e abre a mesma janela dos financeiros (DevolverParteDaVenda)', () => {
    expect(acoes).toContain("import { DevolverParteDaVenda } from '@/components/shared/devolver-parte-da-venda'")
    expect(acoes).toMatch(/<DevolverParteDaVenda transacaoId=\{l\.id\}/)
  })
})
