import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * A taxa e o líquido do cartão aparecem ao escolher a forma, em TODA folha de
 * receber (A25 da 39ª, princípio 3; a regra é a do A40 da 8ª: "a taxa e o
 * líquido aparecem ao escolher"). O `AvisoDaTaxa` só mostra a taxa e o líquido
 * com o valor (`total`): a folha do crédito do receber no PDV (as parcelas em
 * aberto) e a do "Receber no cartão" não o passavam, e a taxa vinha escondida.
 */

const raiz = path.resolve(__dirname, '..')

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(nome => {
    const p = path.join(dir, nome)
    if (statSync(p).isDirectory()) return arquivos(p)
    return p.endsWith('.tsx') ? [p] : []
  })
}

describe('o aviso da taxa recebe o valor em toda folha', () => {
  it('todo <AvisoDaTaxa> passa o total', () => {
    const sem: string[] = []
    for (const arq of [...arquivos(path.join(raiz, 'components')), ...arquivos(path.join(raiz, 'app'))]) {
      const txt = readFileSync(arq, 'utf8')
      for (const m of txt.matchAll(/<AvisoDaTaxa\s[^>]*\/>/g)) {
        if (!/\btotal=/.test(m[0])) sem.push(`${path.relative(raiz, arq)}: ${m[0]}`)
      }
    }
    expect(sem).toEqual([])
  })
})
