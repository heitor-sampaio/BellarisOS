import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O cargo que não abre módulo nenhum, na tela de Cargos (CG-28). A13 da 40ª
 * simulação: "Sem acesso a nenhum módulo" aparecia duas vezes na mesma tela —
 * no cartão do cargo e no topo da matriz. R41, o Heitor, 27/11: "Só em cima
 * da matriz (a proposta)". O cartão volta ao resumo de sempre.
 */
const ler = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8')

describe('o aviso do cargo sem acesso só em cima da matriz', () => {
  const f = ler('components/admin/roles-editor.tsx')
  const inicio = f.indexOf('function RoleCard(')
  const cartao = f.slice(inicio, inicio + f.slice(inicio).search(/\r?\n\}\r?\n/))

  it('o cartão do cargo não tem o aviso', () => {
    expect(cartao, 'o cartão existe').toContain('data-cargo={role.id}')
    expect(cartao).not.toContain('CARGO_SEM_ACESSO')
    expect(cartao).not.toContain('data-cargo-sem-acesso')
  })

  it('a matriz tem, uma vez', () => {
    expect(f.match(/\{CARGO_SEM_ACESSO\}/g)).toHaveLength(1)
    expect(f).toMatch(/\{nothingGranted && \(\s*<div data-cargo-sem-acesso/)
  })
})
