import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A4 da 43ª (princípio 7): de volta da assinatura do contrato, enquanto o
 * servidor confere, o "Vender por" parecia não fazer nada — o "Conferindo a
 * assinatura…" era uma linha discreta acima dos botões. O botão mostra que
 * está trabalhando, como os outros do sistema: desligado, com o rótulo de
 * andamento nele mesmo.
 */
const f = readFileSync(join(__dirname, '..', 'components', 'shared', 'vender-pacote.tsx'), 'utf8')
const i = f.indexOf('`Vender por ${formatBRL(fid.aPagar)}`')
const botao = f.slice(f.lastIndexOf('<button', i), i + 60)

describe('o "Vender por" mostra que confere a assinatura', () => {
  it('enquanto confere, o botão diz "Conferindo a assinatura…" e fica desligado', () => {
    expect(i).toBeGreaterThan(0)
    expect(botao).toMatch(/data-conferindo-a-assinatura=\{conferindo \|\| undefined\}/)
    expect(botao).toMatch(/disabled=\{conferindo \|\| pendente \|\|/)
    expect(botao).toMatch(/\{conferindo \? 'Conferindo a assinatura…' : pendente \? 'Vendendo…' : `Vender por/)
  })

  it('a linha discreta de antes sai (o andamento está no botão)', () => {
    expect(f.match(/Conferindo a assinatura…/g)?.length).toBe(1)
  })
})
