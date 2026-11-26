import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nomeDaLinhaDoPlano } from '@/lib/financeiro/nome-da-parcela'

const ler = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/**
 * Princípio 3 (vendas-financeiro:CR-05, "— parcela 2/3", e AC-01, "a parcela
 * pendente diz qual é"). A5 da 31ª: a 30ª deu o procedimento à parcela do
 * ATENDIMENTO ("Microagulhamento — parcela 2/3"); a do PLANO seguia "Plano de
 * tratamento — parcela 1/2", sem dizer de quê. A descrição gravada não muda
 * (`plano_checkout`; e2e/checkout-entrada-no-cartao.spec.ts a confere): o nome
 * da linha diz os procedimentos do plano.
 */
describe('a parcela do plano diz os procedimentos dele', () => {
  it('um procedimento: quantas vezes e qual', () => {
    expect(nomeDaLinhaDoPlano(['Microagulhamento', 'Microagulhamento', 'Microagulhamento'], 'Plano de tratamento — parcela 1/2'))
      .toBe('Plano de tratamento (3× Microagulhamento) — parcela 1/2')
  })
  it('vários: cada um com as vezes, na ordem do plano', () => {
    expect(nomeDaLinhaDoPlano(['Drenagem', 'Radiofrequência', 'Drenagem', 'Drenagem', 'Radiofrequência', 'Drenagem'], 'Plano de tratamento — entrada'))
      .toBe('Plano de tratamento (4× Drenagem + 2× Radiofrequência) — entrada')
  })
  it('à vista, sem parte: o plano com os procedimentos', () => {
    expect(nomeDaLinhaDoPlano(['Peeling'], 'Plano de tratamento')).toBe('Plano de tratamento (1× Peeling)')
  })
  it('sem procedimento, ou descrição que não é a do plano: nulo (a tela mostra a descrição)', () => {
    expect(nomeDaLinhaDoPlano([], 'Plano de tratamento — parcela 1/2')).toBeNull()
    expect(nomeDaLinhaDoPlano(['Peeling'], 'Estorno — Plano de tratamento')).toBeNull()
    expect(nomeDaLinhaDoPlano(['Peeling'], null)).toBeNull()
  })
  it('a descrição gravada do plano segue a mesma (a tela é que diz os procedimentos)', () => {
    expect(ler('actions/treatment-plans.ts')).toContain("const descricao = 'Plano de tratamento'")
  })
  it('as parcelas em aberto do PDV dizem os procedimentos do plano', () => {
    const t = ler('lib/pdv/parcelas-da-cliente.ts')
    expect(t).toContain('procedimentosDosPlanos(')
    expect(t).toContain('nomeDaLinhaDoPlano(')
  })
  it('a aba Financeiro da ficha diz os procedimentos do plano, depois do nome da parcela do atendimento', () => {
    const t = ler('lib/clientes/financeiro-da-ficha.ts').replace(/\r/g, '')
    expect(t).toContain("import { procedimentosDosPlanos } from '@/lib/financeiro/procedimentos-do-plano'")
    expect(t).toMatch(/procedimentosDosPlanos\(\(linhas as Linha\[\]\)\.map\(l => l\.treatment_plan_id\)\)/)
    expect(t).toMatch(/descricao: l\.description \}\)\s*\?\? \(l\.treatment_plan_id \? nomeDaLinhaDoPlano\(dosPlanos\.get\(l\.treatment_plan_id\) \?\? \[\], l\.description\) : null\)/)
  })
  it('Relatórios → Parcelas pendentes: a linha do plano chega à tabela com os procedimentos', () => {
    const t = ler('components/admin/reports-bi-section.tsx').replace(/\r/g, '')
    expect(t).toContain("import { procedimentosDosPlanos } from '@/lib/financeiro/procedimentos-do-plano'")
    expect(t).toMatch(/\.select\('id, treatment_plan_id'\)\.in\('id', /)
    expect(t).toMatch(/description: \(planoDa\.get\(i\.id\) \? nomeDaLinhaDoPlano\(dosPlanos\.get\(planoDa\.get\(i\.id\)!\) \?\? \[\], i\.description\) : null\) \?\? i\.description/)
  })
})
