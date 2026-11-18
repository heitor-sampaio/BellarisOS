import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A ficha é da REDE: nada lê `clients.branch_id` para decidir (auditoria das
 * regras, 18/11; o Heitor: "o cliente não é da unidade, o cliente é da rede" —
 * H16; "Como o cliente pertence à clínica, a unidade, o portal da unidade vê
 * todos os clientes" — CL-P1; "Nada se prende a clients.branch_id" —
 * CLAUDE.md §5; "o cliente é da rede, já falei 1000x" — 18/11).
 *
 * A coluna fica no banco como "onde a ficha nasceu" (gravada no cadastro), e
 * nenhuma leitura a usa: o portal da cliente, o pedido de assinatura, o plano
 * novo, o mapa de injetáveis, o fuso das automações, o evento da cliente, a
 * exportação da LGPD, a ficha e a conversa. A trava: nenhuma consulta a
 * `clients` pede `branch_id` nem embute a unidade (`branches(…)`).
 */

const WEB = join(__dirname, '..')
const PASTAS = ['lib', 'actions', 'app', 'components']

function arquivos(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho))
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho)
  }
  return saida
}

describe('nada lê a unidade de cadastro da ficha', () => {
  it('nenhuma consulta a clients seleciona branch_id nem embute branches', () => {
    const achados: string[] = []
    for (const pasta of PASTAS) {
      for (const arq of arquivos(join(WEB, pasta))) {
        const texto = readFileSync(arq, 'utf8')
        const re = /\.from\('clients'\)\s*\.select\(\s*(['`])([\s\S]*?)\1/g
        for (const m of texto.matchAll(re)) {
          const colunas = m[2]!
          if (/(^|[\s,(])branch_id\b|branches[!(]/.test(colunas)) achados.push(`${relative(WEB, arq)}: ${colunas.replace(/\s+/g, ' ').slice(0, 90)}`)
        }
      }
    }
    expect(achados).toEqual([])
  })
})
