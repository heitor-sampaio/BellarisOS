import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A15 da 41ª (princípio 7): em "Configurar funis", desativar um motivo de perda
// ou uma origem é um clique no chip, que ficava só cinza e riscado — a cor era
// o único sinal do estado. O chip desativado diz "desativado"/"desativada"
// (rótulo curto, como a sala "Desativada"); sem confirmação, porque volta com
// outro clique.

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o chip desativado diz o estado', () => {
  it('o motivo de perda', () => {
    expect(fonte('components/branch/motivos-de-perda-config.tsx'))
      .toMatch(/\{!m\.ativo && <span data-estado-do-chip[^>]*> · desativado<\/span>\}/)
  })
  it('a origem', () => {
    expect(fonte('components/branch/origens-do-lead-config.tsx'))
      .toMatch(/\{!o\.ativo && <span data-estado-do-chip[^>]*> · desativada<\/span>\}/)
  })
})
