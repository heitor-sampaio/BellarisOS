import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFINICOES } from '@/lib/metrics/definicoes'

const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')

/**
 * A11 da 38ª (princípio 3; indicadores RE-10: os concluídos sem pagamento à
 * parte, sem somar — e sem dizer "Nada"): Relatórios → Financeiro, "A receber
 * em aberto", dizia "Nada a receber em aberto." e logo abaixo "Concluídos sem
 * pagamento: R$ 200,00". Com concluídos a receber, o "Nada" não aparece.
 */
describe('A receber em aberto: o "Nada" não aparece ao lado dos concluídos sem pagamento', () => {
  it('a tabela vazia só diz "Nada" quando também não há concluído a receber', () => {
    const view = fonte('components/admin/reports-bi-view.tsx')
    const card = view.slice(view.indexOf('<SCard title="A receber em aberto"'), view.indexOf('</SCard>', view.indexOf('<SCard title="A receber em aberto"')))
    expect(card).toContain('emptyMsg="Nada a receber em aberto."')
    expect(card).toMatch(/\(installRows\.length > 0 \|\| !comConcluidos\) && \(\s*<SimpleTable/)
  })
})

/**
 * A12 da 38ª (indicadores TM-02: a conta do ticket médio está na dica "Como o
 * ticket médio é contado" em toda tela): a aba Clientes tinha o "Ticket médio"
 * sem a dica que a Visão geral e os Procedimentos têm.
 */
describe('o Ticket médio tem a dica em toda aba dos Relatórios', () => {
  it('cada cartão do ticket médio leva DEFINICOES.ticket', () => {
    const view = fonte('components/admin/reports-bi-view.tsx')
    const cartoes = [...view.matchAll(/<KpiCard label="Ticket médio[^"]*"[^\n]*/g)].map(m => m[0])
    expect(cartoes.length).toBeGreaterThanOrEqual(3)
    for (const c of cartoes) expect(c, c).toContain('dica={DEFINICOES.ticket}')
  })
})

/**
 * A13 da 38ª (princípio 7, "intuitivo não é explicativo", o Heitor, 26/11): a
 * dica da receita dos atendimentos (Top 5, Top 10, por categoria, por
 * profissional) era um parágrafo que explicava a tela. Fica o que a conta é,
 * no tamanho das outras dicas; o que a A36 da 22ª pede continua (o líquido do
 * voucher e dos pontos, e o Total vendido).
 */
describe('a dica da receita dos atendimentos diz a conta, curta', () => {
  it('no tamanho das outras dicas', () => {
    const t = DEFINICOES.receitaDosAtendimentos.texto
    expect(t.length, t).toBeLessThanOrEqual(260)
    expect(t).toContain('líquido do voucher e dos pontos')
    expect(t).toContain('Total vendido')
    expect(t).toMatch(/para quem atendeu/)
    expect(t).toMatch(/pacote, de pré-pago ou de plano/)
  })
})
