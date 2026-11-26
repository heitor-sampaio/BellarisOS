import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * plataforma:UN-05: o "Número" entra DEPOIS do logradouro ("Rua Padre Chagas,
 * 123 — Moinhos de Vento"). Com o logradouro vazio e o número "200", a unidade
 * era gravada com o endereço "200" — e a edição o abria como logradouro.
 * Decisão do Claude, 26/11 (princípio 2: só o impossível é recusado; um número
 * sem a rua não é endereço): o servidor recusa, e a tela diz por quê.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o número da unidade sem o logradouro', () => {
  it('é reconhecido (o número sem a rua); com a rua, ou sem número, passa', async () => {
    const { numeroSemLogradouro } = await import('@/lib/unidades/endereco-com-numero')
    expect(numeroSemLogradouro('', '200')).toBe(true)
    expect(numeroSemLogradouro('   ', ' 200 ')).toBe(true)
    expect(numeroSemLogradouro(null, '200')).toBe(true)
    expect(numeroSemLogradouro('Rua A', '200')).toBe(false)
    expect(numeroSemLogradouro('', '')).toBe(false)
    expect(numeroSemLogradouro('Rua A', null)).toBe(false)
  })

  it('criar e editar a unidade recusam com o motivo, antes de gravar', async () => {
    const { NUMERO_SEM_LOGRADOURO } = await import('@/lib/unidades/endereco-com-numero')
    expect(NUMERO_SEM_LOGRADOURO).toMatch(/logradouro/)
    const f = fonte('actions/branches.ts')
    expect(f.match(/numeroSemLogradouro\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(f).toMatch(/return \{ error: NUMERO_SEM_LOGRADOURO \}/)
  })
})
