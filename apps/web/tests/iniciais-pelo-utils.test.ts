import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Iniciais de nome saem de `iniciaisDoNome` (@estetica-os/utils), nunca de
 * `nome[0]` (CLAUDE.md §14: quebra em emoji e em letra com acento composta).
 * A simulação de um dia de clínica (2026-10-20) achou seis funções locais
 * fazendo por conta própria. Função de iniciais nova que não passe pelo utils
 * é o defeito de volta.
 */
const RAIZ = path.resolve(__dirname, '..', '..', '..')
const PASTAS = ['apps/web', 'apps/sistema', 'apps/suporte', 'packages/nucleo/src'].map(p => path.join(RAIZ, p))

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['node_modules', '.next', 'e2e', 'tests', 'android', '.sim', 'public'].includes(e.name)) return []
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('iniciais', () => {
  it('toda função de iniciais passa por iniciaisDoNome', () => {
    const fora: string[] = []
    for (const f of PASTAS.flatMap(arquivos)) {
      const s = fs.readFileSync(f, 'utf8')
      for (const m of s.matchAll(/function (initials|getInitials|iniciais)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
        if (!m[2]!.includes('iniciaisDoNome')) fora.push(`${path.relative(RAIZ, f)}: ${m[1]}`)
      }
    }
    expect(fora).toEqual([])
  })
})
