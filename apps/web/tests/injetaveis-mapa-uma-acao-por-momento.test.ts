import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A8 da 37ª simulação (princípio 7; o Heitor, 26/11: "isso não é ser
 * intuitivo, é ser explicativo e não isso que eu quero. Ser intuitivo é
 * justamente o contrario, ser facil de usar mesmo sem muitas explicações."):
 * o mapa mostrava "Confirmar aplicação" e "Registrar aplicação" com uma dica
 * que explicava a diferença dos botões, e o campo do mapa tinha outra frase
 * que explicava onde a aplicação se registra. As duas explicações saem.
 *
 * E o "Confirmar aplicação" sai também (o Heitor, 27/11: "Um botão só,
 * "Registrar aplicação" (a proposta)"): o registrar já copia a dose prevista
 * nos pontos sem a aplicada, e a coluna "Aplicado" fica sempre à vista no
 * atendimento. Antes, este teste exigia o "Confirmar aplicação" no campo.
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
  })

  it('um botão só: o campo não tem "Confirmar aplicação", e o "Aplicado" vem da conta do registrar', () => {
    const f = fonte('components/branch/injectable-map-field.tsx')
    expect(f).not.toContain('Confirmar aplicação')
    expect(f).not.toContain('Aplicação confirmada')
    expect(f).toContain('aplicadoAoRegistrar(')
    expect(f).toContain('label="Aplicado"')
  })
})
