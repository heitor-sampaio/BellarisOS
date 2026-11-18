import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O aviso de pontos a vencer leva ao portal da cliente — pela unidade dos
 * PONTOS que vencem (a venda/o atendimento que os deu), não pela unidade em
 * que a ficha nasceu (auditoria das regras, 18/11; o Heitor: "o cliente não é
 * da unidade, o cliente é da rede" — H16; "Nada se prende a
 * clients.branch_id" — CLAUDE.md §5). Sem unidade nos pontos, a última que
 * ela usou no portal; sem nenhuma, a primeira ativa da rede.
 */

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

function ultimaQueDefine(): { nome: string; texto: string } {
  const nomes = readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql')).sort()
  let achada: { nome: string; texto: string } | null = null
  for (const nome of nomes) {
    const texto = readFileSync(join(MIGRATIONS, nome), 'utf8')
    if (/create\s+or\s+replace\s+function\s+public\.avisos_de_vencimento\s*\(/i.test(texto)) achada = { nome, texto }
  }
  if (!achada) throw new Error('nenhuma migration define avisos_de_vencimento')
  return achada
}

describe('avisos_de_vencimento', () => {
  it('não escolhe a unidade pela de cadastro da ficha', () => {
    const { nome, texto } = ultimaQueDefine()
    expect(texto, nome).not.toMatch(/c\.branch_id/)
  })
  it('vai à unidade dos pontos que vencem, depois à última do portal', () => {
    const { nome, texto } = ultimaQueDefine()
    expect(texto, nome).toMatch(/t\.branch_id/)
    expect(texto, nome).toMatch(/portal_ultima_unidade/)
  })
})
