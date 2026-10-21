import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Entrada de estoque é só por estoque_entrada / estoque_inicial / estoque_ajuste
 * (docs/regras/atendimento.md, "O que nunca fazer"): a linha do saldo travada,
 * tudo numa transação. Até 2026-10-21 o createProduct gravava movimento, saldo,
 * lote e despesa soltos (a simulação de um dia de clínica viu). Nenhum código
 * dos apps insere movimento ou lote direto pelo PostgREST.
 */
const WEB = path.resolve(__dirname, '..')

function arquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (['node_modules', '.next', 'e2e', 'tests', 'android', '.sim', 'public'].includes(e.name)) return []
    const p = path.join(dir, e.name)
    return e.isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('estoque', () => {
  it('ninguém insere movimento ou lote direto', () => {
    const fora = arquivos(WEB).filter(f => /from\(\s*'(stock_movements|product_batches)'\s*\)\s*\.\s*(insert|upsert)/.test(fs.readFileSync(f, 'utf8')))
    expect(fora.map(f => path.relative(WEB, f))).toEqual([])
  })
})
