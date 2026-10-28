import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { mediaPorAtendimento, mediaPorExecucao, participacaoPct } from '@/lib/metrics/resultado'

/**
 * As duas médias que sobravam NA TELA (frente F da simulação de 2026-10-28,
 * §13.1 — nenhuma tela divide): a "Média por atend." do ranking de clientes do
 * dashboard da rede (o pago ÷ os concluídos) e a "Média por execução" da
 * tabela por procedimento dos Relatórios (a receita ÷ as execuções), com o
 * "% do Total" da mesma tabela. O número não muda; a conta passa a morar em
 * lib/metrics, que entrega a linha pronta.
 */
describe('mediaPorAtendimento (ranking de clientes do dashboard)', () => {
  it('é o pago ÷ os atendimentos concluídos', () => {
    // A Joana do indicadores-uma-conta-so: pagou R$ 180, dois concluídos (um de R$ 0).
    expect(mediaPorAtendimento({ totalSpent: 180, appointments: 2 })).toBe(90)
  })
  it('sem atendimento não há média ("—")', () => {
    expect(mediaPorAtendimento({ totalSpent: 50, appointments: 0 })).toBeNull()
  })
})

describe('mediaPorExecucao e participacaoPct (tabela por procedimento)', () => {
  it('a receita do procedimento ÷ as execuções dele', () => {
    expect(mediaPorExecucao({ receita: 540, execucoes: 3 })).toBe(180)
    expect(mediaPorExecucao({ receita: 0, execucoes: 0 })).toBeNull()
  })
  it('a parte do procedimento na receita de serviço, em %', () => {
    expect(participacaoPct(180, 720)).toBe(25)
    expect(participacaoPct(0, 0)).toBeNull()
  })
})

describe('as telas não dividem', () => {
  const ler = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8')
  it('o ranking de clientes do dashboard lê a média pronta', () => {
    expect(ler('components/admin/admin-dashboard-view.tsx')).not.toMatch(/totalSpent\s*\/|\/\s*c\.appointmentCount/)
  })
  it('a tabela por procedimento dos Relatórios lê a média e o % prontos', () => {
    const tela = ler('components/admin/reports-bi-view.tsx')
    expect(tela).not.toMatch(/d\.receita\s*\/\s*d\.execucoes/)
    expect(tela).not.toMatch(/d\.receita\s*\/\s*totalRev/)
  })
})
