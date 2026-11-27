import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P1 da 37ª simulação (C11 do Instituto Tumbérgia; PT-11): a evolução corrigida
 * pela aba Prontuário e o "ver a anterior" listando o texto NOVO. A causa: o
 * "Salvar correção" gravava a evolução (uma versão, com o texto de antes) e,
 * em seguida, SEMPRE a ficha — e a ficha com o planejador de injetáveis volta
 * do servidor com um retrato novo (`retratoEm` de agora), que conta como
 * mudança: nascia uma SEGUNDA versão, a "Como estava", já com a evolução nova.
 * A ficha só se grava quando quem corrige mexeu nela.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('corrigir só a evolução guarda UMA versão', () => {
  it('a correção acompanha se a ficha foi mexida', () => {
    const c = fonte('components/branch/correcao-do-registro.tsx')
    expect(c).toContain('onAnswersChange=')
  })
  it('e só grava a ficha mexida', () => {
    const c = fonte('components/branch/correcao-do-registro.tsx')
    const salvar = c.slice(c.indexOf('async function salvar'), c.indexOf('if (!aberta)'))
    expect(salvar).toMatch(/fichaMexida\s*\?\s*await fichaRef\.current\?\.save\(\)/)
  })
})
