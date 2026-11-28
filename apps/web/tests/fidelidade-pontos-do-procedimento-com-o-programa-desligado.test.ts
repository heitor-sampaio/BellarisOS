import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-03 (recomendação do Claude aprovada pelo Heitor, 13/11: "concordo"): "No modo por procedimento, os
 * pontos de cada procedimento se editam no cadastro dele, e o campo só aparece nesse modo." — o campo depende
 * do MODO, não de o programa estar ligado. Princípio 6 (nada se move sozinho: a rede prepara com o programa
 * desligado e liga depois). A1 da 42ª: o campo "Pontos de fidelidade" só aparecia com o programa ligado, e a
 * rede que montava o programa antes de ligar não tinha onde dar os pontos (decisão B-3 da 42ª, do Claude).
 * Sem a fidelidade no plano da assinatura, o campo não aparece (PG-02).
 */

const WEB = join(__dirname, '..')
const fonte = readFileSync(join(WEB, 'app/_shared/catalogo-de-procedimentos.tsx'), 'utf8').replace(/\r/g, '')

describe('o campo de pontos do procedimento', () => {
  const linha = fonte.split('\n').find(l => /const pontosPorProcedimento\s*=/.test(l)) ?? ''
  it('aparece no modo "por procedimento", ligado ou desligado', () => {
    expect(linha, 'a condição do campo').not.toBe('')
    expect(linha).toContain("earn_mode === 'POR_PROCEDIMENTO'")
    expect(linha).not.toMatch(/\.enabled/)
  })
  it('não aparece sem a fidelidade no plano da assinatura', () => {
    expect(linha).toMatch(/temRecurso\(ctx, 'fidelidade'\)/)
  })
})
