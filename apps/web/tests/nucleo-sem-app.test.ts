import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * `packages/nucleo` é o código que os TRÊS apps usam (clínica, sistema e
 * suporte). Ele não pode depender de nenhum deles: um import `@/` ali dentro
 * resolveria para o app que estiver compilando — no sistema, um arquivo que
 * não existe; pior, um arquivo de mesmo nome com outro conteúdo.
 */
const RAIZ = path.resolve(__dirname, '..', '..', '..', 'packages', 'nucleo', 'src')

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('packages/nucleo', () => {
  const lista = arquivos(RAIZ)

  it('existe e tem o código compartilhado (db, supabase, redes, suporte, plataforma)', () => {
    const rel = lista.map(f => path.relative(RAIZ, f).split(path.sep).join('/'))
    for (const esperado of [
      'lib/db.ts', 'lib/supabase/admin.ts', 'lib/supabase/server.ts', 'lib/supabase/client.ts',
      'lib/supabase/cookie-de-sessao.ts', 'lib/redes/situacao.ts', 'lib/suporte/sessao.ts',
      'lib/plataforma/contexto.ts', 'components/shared/realtime-refresher.tsx',
    ]) expect(rel).toContain(esperado)
  })

  it('não importa de nenhum app (nem `@/`, nem caminho para apps/)', () => {
    const ruins: string[] = []
    for (const f of lista) {
      const s = fs.readFileSync(f, 'utf8')
      for (const m of s.matchAll(/(?:from\s+|import\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
        const spec = m[1]!
        if (spec.startsWith('@/') || /(^|\/)apps\//.test(spec)) ruins.push(`${path.relative(RAIZ, f)}: ${spec}`)
      }
    }
    expect(ruins).toEqual([])
  })
})
