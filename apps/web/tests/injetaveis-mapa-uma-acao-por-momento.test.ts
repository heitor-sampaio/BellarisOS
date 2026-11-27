import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A8 da 37ª simulação (princípio 7; o Heitor, 26/11: "isso não é ser
 * intuitivo, é ser explicativo e não isso que eu quero. Ser intuitivo é
 * justamente o contrario, ser facil de usar mesmo sem muitas explicações."):
 * o mapa mostrava "Confirmar aplicação" e "Registrar aplicação" com uma dica
 * que explicava a diferença dos botões, e o campo do mapa tinha outra frase
 * que explicava onde a aplicação se registra. As duas explicações saem; os
 * botões ficam (o que cada um faz continua).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('o mapa de injetáveis sem as explicações dos botões', () => {
  it('o mapa aberto não tem a dica "O que cada botão faz"', () => {
    const m = fonte('components/branch/mapa-injetavel.tsx')
    expect(m).not.toContain('data-o-que-cada-botao-faz')
    expect(m).not.toContain('O que cada botão faz')
    // Os botões continuam.
    expect(m).toContain('Salvar planejamento')
    expect(m).toContain("'Registrar aplicação'")
  })

  it('o campo do mapa não explica onde a aplicação se registra', () => {
    const f = fonte('components/branch/injectable-map-field.tsx')
    expect(f).not.toContain('data-aplicacao-no-atendimento')
    expect(f).not.toContain('A aplicação se registra no atendimento')
    expect(f).toContain('Confirmar aplicação')
  })
})
