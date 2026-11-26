import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * plataforma:PN-11 ("os limites do plano … valem ao criar e ao reativar
 * unidade …; a tela diz o limite") e CLAUDE.md §14 ("a action devolve
 * { error } em vez de lançar"). Reativar a unidade com o limite cheio lançava
 * `limiteDoPlano`, e a tela inteira virava "Limite do plano atingido… Ir para o
 * início"; criar, com o mesmo limite, avisava no formulário. Decisão E do
 * Claude, 26/11: reativar é recusado como criar — o aviso no lugar.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

function corpo(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.search(new RegExp(`(async )?function ${nome}\\b`))
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const fim = f.indexOf('\nexport ', i + 10)
  return f.slice(i, fim < 0 ? undefined : fim)
}

describe('reativar a unidade no limite do plano diz o limite no lugar', () => {
  it('a action devolve { error } com o limite, não lança', () => {
    const c = corpo('actions/branches.ts', 'toggleBranchStatus')
    expect(c).not.toMatch(/throw limiteDoPlano/)
    expect(c).toMatch(/if \(limite\) return \{ error: limite \}/)
  })

  it('as duas portas do Reativar mostram a recusa ao lado do botão (não a tela de erro)', () => {
    expect(existsSync(join(__dirname, '..', 'components/admin/reativar-unidade.tsx'))).toBe(true)
    const botao = fonte('components/admin/reativar-unidade.tsx')
    expect(botao).toMatch(/role="alert"/)
    expect(botao).toMatch(/data-reativar-unidade-recusa/)
    for (const arquivo of ['components/admin/settings-branches.tsx', 'app/admin/branches/[id]/page.tsx']) {
      const f = fonte(arquivo)
      expect(f, arquivo).toMatch(/<ReativarUnidade/)
      expect(f, arquivo).not.toMatch(/toggleBranchStatus\([^)]*true\)\s*\n\s*if \(r\.error\) throw semAcesso\(\)/)
    }
  })
})
