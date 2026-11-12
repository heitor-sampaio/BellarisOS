import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * As telas que mostram dinheiro assinam um SINAL, não a tabela (F67, a sobra
 * da F63): `financial_transactions` e `commissions` não vão pelo Realtime —
 * a linha inteira iria pelo websocket a quem o "só os meus" esconde. E o
 * canal com uma tabela fora da publicação falha INTEIRO (`commissions` e
 * `procedure_sales` não estão nela): o relatório ficava sem tempo real.
 */

const RAIZ = join(__dirname, '..')
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    if (n === 'node_modules' || n.startsWith('.')) return []
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : []
  })
}

describe('o Realtime das telas', () => {
  it('nenhum RealtimeRefresher assina a tabela do dinheiro nem uma fora da publicação', () => {
    const proibidas = ['financial_transactions', 'commissions', 'procedure_sales']
    const achados: string[] = []
    for (const f of [...arquivos(join(RAIZ, 'app')), ...arquivos(join(RAIZ, 'components'))]) {
      const texto = readFileSync(f, 'utf-8')
      for (const m of texto.matchAll(/<RealtimeRefresher[\s\S]*?\/>/g)) {
        for (const t of proibidas) if (m[0].includes(`'${t}'`)) achados.push(`${f.slice(RAIZ.length)}: ${t}`)
      }
    }
    expect(achados).toEqual([])
  })
})
