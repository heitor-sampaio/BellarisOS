import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A22, A23, A25 e A26 da 21ª simulação (2026-11-17): procedimento, catálogo,
 * editor de documento e Equipe.
 */

const ler = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('A22: o seletor do insumo não corta o nome', () => {
  it('a linha do insumo quebra, e o seletor guarda uma largura para o nome (com o nome inteiro no title)', () => {
    const f = ler('components/admin/procedure-form.tsx')
    expect(f).toContain('data-linha-do-insumo')
    expect(f).toMatch(/data-linha-do-insumo[^>]*flexWrap: 'wrap'/)
    expect(f).toMatch(/flex: '1 1 260px'[\s\S]{0,120}title=\{prod \? rotuloDoInsumo\(prod\)/)
  })
})

describe('A23: a faixa dos procedimentos sem insumo diz quais são', () => {
  it('os nomes, até quatro, e "mais N"', async () => {
    const { nomesDosSemInsumo } = await import('@/lib/procedimentos/sem-insumo')
    expect(nomesDosSemInsumo(['Avaliação'])).toBe('Avaliação')
    expect(nomesDosSemInsumo(['Avaliação', 'Massagem'])).toBe('Avaliação e Massagem')
    expect(nomesDosSemInsumo(['Avaliação', 'Massagem', 'Peeling'])).toBe('Avaliação, Massagem e Peeling')
    expect(nomesDosSemInsumo(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C, D e mais 2')
  })
  it('o catálogo mostra os nomes, e o "pode ficar assim" vai para a dica', () => {
    const f = ler('app/_shared/catalogo-de-procedimentos.tsx')
    expect(f).toContain('nomesDosSemInsumo(')
    expect(f).toMatch(/<Dica rotulo="O que não usa insumo"/)
  })
})

describe('A25: o texto inicial do contrato de pacote', () => {
  it('começa com "Contrato de pacote"', () => {
    const f = ler('components/admin/editor-de-documento.tsx')
    expect(f).toMatch(/CONTRATO_PACOTE: \[\s*'# Contrato de pacote',/)
  })
})

describe('A26: a Equipe', () => {
  it('o Reativar tem o texto à vista', () => {
    const f = ler('components/admin/reativar-membro.tsx')
    expect(f).toMatch(/<UserCheck size=\{15\} \/> Reativar/)
  })
  it('a coluna Unidade não quebra palavra a palavra: largura mínima e até duas linhas, com o nome inteiro no title', () => {
    const f = ler('app/admin/team/page.tsx')
    expect(f).toMatch(/data-unidades-do-membro title=\{branchName\}/)
    expect(f).toMatch(/data-unidades-do-membro[\s\S]{0,300}WebkitLineClamp: 2/)
    expect(f).toMatch(/data-unidades-do-membro[\s\S]{0,300}minWidth: 200/)
  })
})
