import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as nota from '@/components/shared/nota-do-vencimento'

/**
 * A12 da 35ª (princípio 3; a Decisão D2 do relatório): Relatórios → Financeiro,
 * "A receber em aberto", listava as parcelas (R$ 60) sem a nota "Concluídos sem
 * pagamento: R$ 60,00 (1 atendimento)" que o Financeiro mostra — a cobrança do
 * avulso reaberta pelo estorno da parcela (EX-09) é atendimento a receber, não
 * lançamento. O mesmo número, com a mesma nota, da mesma fonte
 * (`getTotalDosAtendimentosAReceber`, lib/metrics).
 */
const texto = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

describe('os concluídos sem pagamento nos Relatórios, como no Financeiro', () => {
  it('a nota é uma só, a do Financeiro', () => {
    const Nota = (nota as Record<string, unknown>).NotaDosConcluidosSemPagamento as ((p: { concluidos?: { n: number; valor: number } }) => unknown) | undefined
    expect(Nota, 'NotaDosConcluidosSemPagamento em components/shared/nota-do-vencimento').toBeTypeOf('function')
    expect(texto(createElement(Nota as never, { concluidos: { n: 1, valor: 60 } }))).toMatch(/^Concluídos sem pagamento: R\$\s60,00 \(1 atendimento\)$/)
    expect(texto(createElement(Nota as never, { concluidos: { n: 0, valor: 0 } }))).toBe('')
    expect(fonte('components/shared/nota-do-vencimento.tsx')).toMatch(/<NotaDosConcluidosSemPagamento concluidos=\{concluidosSemPagamento\}/)
  })

  it('o "A receber em aberto" dos Relatórios a mostra, com o número de lib/metrics', () => {
    const view = fonte('components/admin/reports-bi-view.tsx')
    const card = view.slice(view.indexOf('<SCard title="A receber em aberto"'))
    expect(card.slice(0, 600)).toMatch(/<NotaDosConcluidosSemPagamento concluidos=\{p\.concluidosSemPagamento\}/)
    const secao = fonte('components/admin/reports-bi-section.tsx')
    expect(secao).toMatch(/getTotalDosAtendimentosAReceber\(/)
    expect(secao).toMatch(/concluidosSemPagamento=\{/)
  })
})
