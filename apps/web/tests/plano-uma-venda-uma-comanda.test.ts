import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Uma venda, uma comanda (o Heitor, 13/11: "Tudo que for uma venda gera uma
 * comanda" — PV-06 do catálogo de Vendas e financeiro). O pagamento do plano
 * NÃO cobra junto o atendimento que gerou o plano: ele tem a comanda dele no
 * PDV, aberta no início do atendimento (PDV3). Era a decisão de 20/10 (o
 * "atendimento de hoje" no checkout), mais velha; a revisão das perguntas de
 * 24/11 (a DP-04 contra a PV-06) a deu por defeito.
 */

const WEB = join(__dirname, '..')
const MONO = join(WEB, '..', '..')
const fonte = (rel: string) => readFileSync(join(WEB, rel), 'utf8')

function arquivos(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap(e => {
    const rel = join(dir, e.name)
    if (e.isDirectory()) return arquivos(rel)
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : []
  })
}

/** O corpo de uma função do arquivo, até a próxima função de topo. */
function corpo(arquivo: string, nome: string): string {
  const texto = fonte(arquivo)
  const i = texto.search(new RegExp(`\\n(export )?async function ${nome}\\b`))
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const resto = texto.slice(i + 1)
  const fim = resto.slice(1).search(/\n(export )?(async )?function /)
  return fim < 0 ? resto : resto.slice(0, fim + 1)
}

describe('o pagamento do plano cobra só o plano: o atendimento que o gerou tem a comanda dele', () => {
  it('o fechamento do plano não recebe o atendimento de origem', () => {
    const c = corpo('actions/treatment-plans.ts', 'checkoutTreatmentPlanInterno')
    expect(c, 'o atendimento se recebe na comanda dele, no PDV').not.toContain("'confirmar_pagamento_do_atendimento'")
    expect(c).not.toMatch(/atendimentoDeHoje/)
  })

  it('a janela do pagamento do plano não mostra nem soma o atendimento de origem', () => {
    const wizard = fonte('components/branch/checkout-wizard.tsx')
    expect(wizard).not.toMatch(/atendimentoDeHoje/)
    expect(wizard).not.toContain('Atendimento de hoje')
    expect(wizard).not.toContain('(com o atendimento de hoje)')
    expect(wizard).not.toContain('data-hoje-entra')
  })

  it('ninguém mais monta o "atendimento de hoje" do plano', () => {
    expect(existsSync(join(WEB, 'lib/checkout/atendimento-de-hoje.ts'))).toBe(false)
    const quem = ['app', 'components', 'actions', 'lib'].flatMap(arquivos)
      .filter(a => /atendimentoDeHoje|atendimento-de-hoje/.test(fonte(a)))
    expect(quem).toEqual([])
  })

  it('a regra escrita diz o mesmo', () => {
    const regra = readFileSync(join(MONO, 'docs/regras/vendas-financeiro.md'), 'utf8')
    expect(regra).not.toContain('O checkout do plano cobra também o "atendimento de hoje"')
    expect(regra).toMatch(/O pagamento do plano cobra só o plano/)
  })
})
