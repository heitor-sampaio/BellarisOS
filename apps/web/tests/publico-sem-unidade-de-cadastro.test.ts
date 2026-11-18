import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O público de uma campanha não lê a unidade de cadastro da ficha (auditoria
 * das regras, 18/11; o Heitor: "o cliente não é da unidade, o cliente é da
 * rede" — H16; "Nada se prende a clients.branch_id" — CLAUDE.md §5).
 *
 * `clientes_do_publico` não recorta a cliente por unidade, mas o fuso de
 * "sem retorno desde" e de "cliente desde antes de" saía de
 * `fuso_da_unidade(c.branch_id)` — a unidade em que a ficha nasceu. Vale o
 * fuso da REDE (`fuso_do_recorte(p_tenant, null)`), o mesmo de
 * `fusoDaRede` e das contas de "Novos clientes".
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function ultimaDefinicao(): { nome: string; corpo: string } {
  let achada: { nome: string; corpo: string } | null = null
  for (const nome of readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()) {
    const texto = readFileSync(join(MIGRATIONS, nome), 'utf8')
    const m = /create\s+or\s+replace\s+function\s+public\.clientes_do_publico\s*\(([\s\S]*?)\$function\$\s*;/i.exec(texto)
      ?? /create\s+or\s+replace\s+function\s+public\.clientes_do_publico\s*\(([\s\S]*?)\$\$\s*;/i.exec(texto)
    if (m) achada = { nome, corpo: m[1]! }
  }
  if (!achada) throw new Error('nenhuma migration define clientes_do_publico')
  return achada
}

describe('clientes_do_publico', () => {
  it('não lê clients.branch_id (nem para o fuso)', () => {
    const { nome, corpo } = ultimaDefinicao()
    expect(corpo, nome).not.toMatch(/c\.branch_id/)
    expect(corpo, nome).toMatch(/fuso_do_recorte\(p_tenant/)
  })
})
