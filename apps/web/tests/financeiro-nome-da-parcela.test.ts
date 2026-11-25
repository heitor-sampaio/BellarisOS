import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nomeDaLinhaDoLancamento, parteDaVenda } from '@/lib/financeiro/nome-da-parcela'

/**
 * A linha do lançamento diz QUAL parcela é (vendas-financeiro:CR-05, "— parcela
 * 2/3"; AC-01, "a parcela pendente diz qual é"; princípio 3). A ficha mostrava
 * o nome do procedimento no lugar da descrição — as três parcelas do
 * crediário do Microagulhamento eram três "Microagulhamento".
 */
const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')

describe('o nome da linha do lançamento com o procedimento', () => {
  it('a parcela do crediário: o procedimento e a parcela', () => {
    expect(nomeDaLinhaDoLancamento('Microagulhamento', { numero: 2, total: 3, descricao: 'Atendimento concluído — parcela 2/3' }))
      .toBe('Microagulhamento — parcela 2/3')
  })
  it('a entrada diz que é a entrada', () => {
    expect(nomeDaLinhaDoLancamento('Microagulhamento', { numero: null, total: null, descricao: 'Atendimento concluído — entrada' }))
      .toBe('Microagulhamento — entrada')
  })
  it('sem a parte na descrição, o número e o total gravados', () => {
    expect(nomeDaLinhaDoLancamento('Limpeza', { numero: 1, total: 1, descricao: 'Atendimento' })).toBe('Limpeza — parcela 1/1')
  })
  it('o pagamento à vista é só o procedimento; sem procedimento, nulo (a tela mostra a descrição)', () => {
    expect(nomeDaLinhaDoLancamento('Limpeza', { numero: null, total: null, descricao: 'Atendimento concluído' })).toBe('Limpeza')
    expect(nomeDaLinhaDoLancamento(null, { numero: 2, total: 3, descricao: 'Pacote X — parcela 2/3' })).toBeNull()
    expect(parteDaVenda({ descricao: 'Pacote X — parcela 2/3' })).toBe('parcela 2/3')
  })
})

describe('a aba Financeiro da ficha usa o nome com a parcela', () => {
  it('o servidor monta o nome da linha com nomeDaLinhaDoLancamento', () => {
    const t = ler('lib/clientes/financeiro-da-ficha.ts')
    expect(t).toContain("from '@/lib/financeiro/nome-da-parcela'")
    expect(t).toMatch(/procedureName:\s+nomeDaLinhaDoLancamento\(l\.appointment\?\.procedures\?\.name, \{ numero: l\.parcela_numero, total: l\.parcela_total, descricao: l\.description \}\)/)
  })
})

describe('Relatórios → Financeiro, Parcelas Pendentes: o prazo dito e o nome legível (princípio 7)', () => {
  it('o prazo diz se é atraso ou o que falta', async () => {
    const { prazoDaParcela } = await import('@/lib/financeiro/nome-da-parcela')
    expect(prazoDaParcela(61)).toBe('vence em 61 dias')
    expect(prazoDaParcela(1)).toBe('vence amanhã')
    expect(prazoDaParcela(0)).toBe('vence hoje')
    expect(prazoDaParcela(-1)).toBe('1 dia de atraso')
    expect(prazoDaParcela(-30)).toBe('30 dias de atraso')
  })
  it('a tabela usa o prazo, com o cabeçalho "Prazo", e o nome com o procedimento', () => {
    const v = ler('components/admin/reports-bi-view.tsx')
    expect(v).toMatch(/key: 'daysLeft', label: 'Prazo'/)
    expect(v).toMatch(/<Badge label=\{prazoDaParcela\(Number\(v\)\)\}/)
    expect(v).toMatch(/what:\s+nomeDaLinhaDoLancamento\(i\.appointment\?\.procedures\?\.name, \{ numero: i\.parcela_numero, total: i\.parcela_total, descricao: i\.description \}\) \?\? i\.description/)
    const s = ler('components/admin/reports-bi-section.tsx')
    expect(s).toContain("'id, amount, due_date, description, branch_id, parcela_numero, parcela_total, clients(name), appointment:appointments!financial_transactions_appointment_id_fkey(procedures(name))'")
  })
})
