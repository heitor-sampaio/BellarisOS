import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Os caches do projeto são `unstable_cache` com tags. Para expirar um deles
 * NA HORA — o membro desativado, a rede bloqueada, a sessão de suporte, a
 * lista de clientes —, é `revalidateTag(tag, { expire: 0 })`.
 *
 * Nem `'max'` (serve o valor velho mais uma vez) nem `updateTag`: em
 * 2026-10-21 a lista de clientes continuou velha com `updateTag` numa de duas
 * rodadas do mesmo teste, e passou três de três com `{ expire: 0 }` (a
 * documentação do Next liga o `updateTag` ao `'use cache'`/`cacheTag`, que o
 * projeto não usa). Os caches de acesso usavam `updateTag`; ficam todos no
 * caminho que se provou.
 */
const APPS = path.resolve(__dirname, '..', '..')
const PACOTES = path.resolve(__dirname, '..', '..', '..', 'packages')

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['node_modules', '.next', 'e2e', 'tests', 'native', 'android', '.sim'].includes(e.name)) return []
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('expirar cache', () => {
  const lista = [...arquivos(APPS), ...arquivos(PACOTES)]

  it('ninguém chama updateTag (é revalidateTag(tag, { expire: 0 }))', () => {
    const comUpdate = lista.filter(f => /\bupdateTag\s*\(/.test(fs.readFileSync(f, 'utf8')))
    expect(comUpdate.map(f => path.relative(APPS, f))).toEqual([])
  })

  it("ninguém expira tag de cache com 'max' (serve o velho mais uma vez)", () => {
    const comMax = lista.filter(f => /revalidateTag\([^)]*,\s*'max'\s*\)/.test(fs.readFileSync(f, 'utf8')))
    expect(comMax.map(f => path.relative(APPS, f))).toEqual([])
  })
})
