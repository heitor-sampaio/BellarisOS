import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "Cancelar voucher" pede o motivo (o banco recusa sem ele: `cancelar_voucher`,
 * e2e/fidelidade-vouchers.spec.ts). A tela dizia isso só DEPOIS do clique, no
 * erro (A23 da 30ª; princípio 7: tela que uma pessoa nova não entende sozinha é
 * defeito). O campo diz que é obrigatório antes, e o "Confirmar cancelamento"
 * só vale com o motivo escrito — e diz por quê enquanto não vale.
 */
const tela = readFileSync(join(__dirname, '..', 'components/branch/vouchers-do-cliente.tsx'), 'utf8')
const bloco = tela.slice(tela.indexOf('{cancelando === v.id && ('), tela.indexOf('Confirmar cancelamento') + 700)

describe('o motivo do cancelamento do voucher, à vista', () => {
  it('o campo diz que o motivo é obrigatório, com o rótulo ligado a ele', () => {
    expect(bloco).toMatch(/Motivo do cancelamento \(obrigatório\)/)
    expect(bloco).toMatch(/htmlFor=\{`motivo-voucher-\$\{v\.id\}`\}/)
    expect(bloco).toMatch(/id=\{`motivo-voucher-\$\{v\.id\}`\}/)
  })
  it('o "Confirmar cancelamento" não vale sem o motivo, e a tela diz por quê', () => {
    expect(bloco).toMatch(/disabled=\{ocupado \|\| !motivo\.trim\(\)\}/)
    expect(bloco).toContain('Escreva o motivo para confirmar.')
  })
})
