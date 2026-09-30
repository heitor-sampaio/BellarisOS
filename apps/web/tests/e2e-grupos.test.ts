import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ISOLADOS, motivoDeNaoSerIsolado } from '../e2e/grupos'

/**
 * A lista dos specs que rodam em paralelo não pode mentir: um isolado que passa
 * a ler a rede real (ou a chamar cron) viraria instabilidade intermitente na
 * suíte completa, difícil de achar. Aqui ele quebra na hora.
 */
const E2E = path.resolve(__dirname, '..', 'e2e')

describe('os specs isolados (suíte em paralelo)', () => {
  it.each(ISOLADOS)('%s existe e cumpre as regras de isolado', arquivo => {
    const caminho = path.join(E2E, arquivo)
    expect(fs.existsSync(caminho), `${arquivo} não existe`).toBe(true)
    expect(motivoDeNaoSerIsolado(fs.readFileSync(caminho, 'utf8'))).toBeNull()
  })

  it('a lista não repete arquivo', () => {
    expect(new Set(ISOLADOS).size).toBe(ISOLADOS.length)
  })
})
