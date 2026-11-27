import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * CLAUDE.md §1 (o Heitor, 13/11: "não quero mais tu falando nomes de cargos
 * como se fossem cargos fixos"; a 36ª já trocou "Esta profissional não realiza
 * este procedimento."): a recusa de quem não atende na unidade dizia "Esta
 * profissional … no lápis dela". Texto neutro, no estilo da 36ª.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('a recusa de quem não atende na unidade fala da pessoa, não de um cargo', () => {
  for (const arq of ['lib/appointments/core.ts', 'lib/appointments/troca-de-profissional.ts']) {
    it(arq, () => {
      const f = fonte(arq)
      expect(f).not.toContain("'Esta profissional'")
      expect(f).not.toContain('no lápis dela')
      expect(f).toMatch(/\|\| 'Quem você escolheu'\} não atende nesta unidade: marque \$\{O_ATENDE_NA_FICHA\} no lápis da pessoa, na Equipe\./)
    })
  }
})
