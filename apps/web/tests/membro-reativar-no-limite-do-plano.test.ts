import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * plataforma:PN-11 ("os limites do plano … valem ao criar e ao reativar …; a
 * tela diz o limite") e CLAUDE.md §14 ("a action devolve { error } em vez de
 * lançar"). O mesmo defeito do Reativar da unidade (D10 da 33ª simulação):
 * reativar MEMBRO com o limite cheio lançava `limiteDoPlano`, e o botão dizia
 * "Não deu certo. Tente de novo." no lugar do limite; criar, com o mesmo
 * limite, avisava no formulário. Decisão do Claude, 26/11: reativar é recusado
 * como criar — o limite ao lado do botão.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

function corpo(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.search(new RegExp(`(async )?function ${nome}\\b`))
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const fim = f.indexOf('\nexport ', i + 10)
  return f.slice(i, fim < 0 ? undefined : fim)
}

describe('reativar e criar membro no limite do plano dizem o limite no lugar', () => {
  it('reativar devolve { error } com o limite, não lança', () => {
    const c = corpo('actions/team.ts', 'reactivateTeamMember')
    expect(c).not.toMatch(/throw limiteDoPlano/)
    expect(c).toMatch(/if \(limite\) return \{ error: limite \}/)
  })

  it('criar também devolve { error } com o limite', () => {
    const c = corpo('actions/team.ts', 'createTeamMember')
    expect(c).not.toMatch(/throw limiteDoPlano/)
    expect(c).toMatch(/if \(limite\) return \{ error: limite \}/)
  })

  it('o Reativar da linha mostra a recusa ao lado do botão', () => {
    const botao = fonte('components/admin/reativar-membro.tsx')
    expect(botao).toMatch(/if \(r\?\.error\) \{ setErro\(r\.error\); return \}/)
    expect(botao).toMatch(/role="alert"/)
  })
})
