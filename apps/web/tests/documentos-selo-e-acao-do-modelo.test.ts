import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A1 da 35ª simulação (princípio 7; design.md, "a curva que distingue um badge
 * de um botão"): em Configurações → Documentos, o selo "Ativo" do contrato de
 * plano era botão — um clique desativava o contrato sem pergunta —, e reativar
 * perguntava "Trocar o contrato?" sem haver contrato ativo para trocar.
 * O selo é selo (diz o estado, não se clica); ativar e desativar são ações com
 * nome; e a pergunta da troca só vem quando há um ativo a trocar.
 */
const TELA = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'admin', 'settings-documentos.tsx'), 'utf8')

describe('A1: o selo do modelo é selo, e a ação tem nome', () => {
  it('o selo Ativo/Inativo não é botão', () => {
    expect(TELA).not.toMatch(/<button[^>]*onClick=\{\(\) => alternar\(m\)\}[^>]*\n?[^>]*aria-pressed/)
    expect(TELA).toMatch(/<span data-selo-do-modelo className=\{m\.ativo \? 'chip chip-success' : 'chip chip-muted'\}>/)
  })
  it('desativar e ativar são botões com o nome da ação', () => {
    expect(TELA).toMatch(/data-desativar-modelo/)
    expect(TELA).toMatch(/'Desativar'/)
    expect(TELA).toMatch(/'Ativar'/)
  })
  it('desativar o contrato da rede pergunta antes', () => {
    expect(TELA).toMatch(/titulo="Desativar o contrato\?"/)
  })
  it('a pergunta "Trocar o contrato?" só com um ativo a trocar', () => {
    expect(TELA).toMatch(/ehDaRede\(g\.tipo\) && !m\.ativo && atualAtivo\(g\.tipo\)/)
  })
})
