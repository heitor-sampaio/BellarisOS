import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unidadeDoPortal } from '@/lib/clientes/unidade-do-portal'

/**
 * O endereço do portal da cliente não sai da unidade em que a ficha NASCEU
 * (auditoria das regras, 18/11; o Heitor: "o cliente não é da unidade, o
 * cliente é da rede" — H16; "Nada se prende a clients.branch_id" — CLAUDE.md
 * §5). O login, o seletor e o "entrar na rede" levavam ao portal da unidade de
 * cadastro (`clients.branch_id` → `branches(slug)`). Agora: a ÚLTIMA unidade
 * que ela usou no portal; sem nenhuma (ou desativada), a primeira unidade
 * ativa da rede.
 */

const WEB = join(__dirname, '..')
const unidades = [
  { id: 'u-centro', slug: 'centro', name: 'Centro' },
  { id: 'u-zona-sul', slug: 'zona-sul', name: 'Zona Sul' },
]

describe('a unidade do portal da cliente', () => {
  it('é a última que ela usou', () => {
    expect(unidadeDoPortal('u-zona-sul', unidades)?.slug).toBe('zona-sul')
  })
  it('sem a última (ou fora das ativas), a primeira ativa da rede', () => {
    expect(unidadeDoPortal(null, unidades)?.slug).toBe('centro')
    expect(unidadeDoPortal('u-desativada', unidades)?.slug).toBe('centro')
  })
  it('sem unidade ativa, nenhuma', () => {
    expect(unidadeDoPortal('u-centro', [])).toBeNull()
  })

  it('o destino do login, as fichas do login e o portal não leem a unidade de cadastro', () => {
    for (const arquivo of ['lib/clientes/destino.ts', 'lib/cached-queries.ts']) {
      const texto = readFileSync(join(WEB, arquivo), 'utf8')
      // `clients` → `branches(…)` é o embed pela unidade de cadastro.
      expect(texto, arquivo).not.toMatch(/from\('clients'\)[\s\S]{0,120}branches\(/)
    }
    const layout = readFileSync(join(WEB, 'app', '[slug]', 'layout.tsx'), 'utf8')
    expect(layout).not.toMatch(/clientData!?\.branch_id/)
  })
})
