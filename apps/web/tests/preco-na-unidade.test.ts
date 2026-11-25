import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { precoNaUnidade } from '@/lib/procedimentos/preco-na-unidade'

// D2 da 9ª simulação: o preço da unidade vale quando ela tem um; senão, o da rede.
describe('precoNaUnidade', () => {
  it('a unidade com preço próprio vale o dela', () => {
    expect(precoNaUnidade(650, 590)).toBe(590)
    expect(precoNaUnidade('650.00', '590.00')).toBe(590)
  })
  it('sem preço próprio, o da rede', () => {
    expect(precoNaUnidade(650, null)).toBe(650)
    expect(precoNaUnidade(650, undefined)).toBe(650)
  })
  it('o preço próprio de R$ 0 (gratuito na unidade) vale', () => {
    expect(precoNaUnidade(650, 0)).toBe(0)
  })
  it('sem preço nenhum, zero', () => {
    expect(precoNaUnidade(null, null)).toBe(0)
  })
})

/**
 * PC-09 e PC-10 do catálogo de Atendimento (a revisão das perguntas de 24/11,
 * Q23): a consulta dos procedimentos de uma unidade oferece só o que ela FAZ
 * ("Em quais unidades", `ofereceNaUnidade`) e com o preço DELA
 * (`comPrecoDaUnidade`). A "consulta correta" escrita na regra
 * (`docs/regras/atendimento.md` §9.3) aplicava só o `branch_id` — quem a
 * copiasse listaria o que a unidade não faz, ao preço da rede.
 */
describe('a consulta dos procedimentos da unidade: o que ela faz, com o preço dela', () => {
  const WEB = join(__dirname, '..')
  const regra = readFileSync(join(WEB, '..', '..', 'docs/regras/atendimento.md'), 'utf8').replace(/\r\n/g, '\n')

  it('a consulta escrita na regra aplica o "Em quais unidades" e o preço da unidade', () => {
    const i = regra.indexOf('Query correta para buscar procedimentos de uma unidade')
    expect(i).toBeGreaterThan(-1)
    const bloco = regra.slice(i, regra.indexOf('```\n', regra.indexOf('```typescript', i) + 14))
    expect(bloco).toContain('ofereceNaUnidade(')
    expect(bloco).toContain('comPrecoDaUnidade(')
    expect(bloco).toContain('COLUNAS_DA_OFERTA')
  })

  it('o código que lista os procedimentos de uma unidade aplica os dois', () => {
    const arquivos = (dir: string): string[] => readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap(e => {
      const rel = join(dir, e.name)
      if (e.isDirectory()) return arquivos(rel)
      return /\.(ts|tsx)$/.test(e.name) ? [rel] : []
    })
    const listam = ['app', 'components', 'actions', 'lib'].flatMap(arquivos).filter(a => {
      const t = readFileSync(join(WEB, a), 'utf8')
      // A lista com PREÇO (o que se oferece para agendar, vender, montar); a das
      // exceções de comissão (só id e nome) é da tela de Comissões.
      return /from\('procedures'\)\s*\.select\([^)]*price[^;]*?\.or\(`branch_id\.is\.null,branch_id\.eq\./.test(t)
    })
    expect(listam.length).toBeGreaterThan(3)
    for (const a of listam) {
      const t = readFileSync(join(WEB, a), 'utf8')
      expect(t, `${a}: o "Em quais unidades"`).toMatch(/ofereceNaUnidade|procedure_branch_availability|recusaDoProcedimentoNaUnidade/)
      expect(t, `${a}: o preço da unidade`).toMatch(/precoNaUnidade|comPrecoDaUnidade|precosDaUnidade|createAppointmentCore/)
    }
  })
})
