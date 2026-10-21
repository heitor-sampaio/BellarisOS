import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A senha dada por OUTRA pessoa nasce provisória (2026-10-21, decisão do
 * Heitor): todo `auth.admin.createUser` da clínica que põe `password` — o
 * membro criado pela Equipe, a cliente com o acesso criado pela clínica —
 * marca `app_metadata.senha_provisoria`, e o proxy leva a pessoa a trocá-la
 * antes de qualquer tela. Criar login com senha sem a marca é a promessa do
 * formulário ("troca no primeiro acesso") sem ninguém cumprir.
 */
const WEB = path.resolve(__dirname, '..')

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['node_modules', '.next', 'e2e', 'tests', 'native', 'android', '.sim', 'public'].includes(e.name)) return []
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('senha provisória', () => {
  it('todo createUser com senha, na clínica, marca senha_provisoria', () => {
    const achados: string[] = []
    const sem: string[] = []
    for (const f of arquivos(WEB)) {
      const s = fs.readFileSync(f, 'utf8')
      for (const m of s.matchAll(/auth\.admin\.createUser\(\{([\s\S]*?)\}\)/g)) {
        const corpo = m[1]!
        if (!/\bpassword\b/.test(corpo)) continue
        const onde = path.relative(WEB, f)
        achados.push(onde)
        if (!/senha_provisoria:\s*true/.test(corpo)) sem.push(onde)
      }
    }
    expect(achados.length, 'os dois pontos que criam senha: equipe e cliente').toBeGreaterThanOrEqual(2)
    expect(sem).toEqual([])
  })
})
