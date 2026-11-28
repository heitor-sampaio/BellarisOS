import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chaveDaAbaPedida } from '@/lib/configuracoes/abas'

/**
 * D17 da 41ª (FI-02: "pré-atendimento" e "anamnese" não aparecem no texto):
 * /<unidade>/settings/fichas levava a `?tab=anamnese` — a aba de antes, que
 * não existe mais (os construtores viraram a aba Fichas) —, e a tela dizia
 * 'A aba "anamnese" não existe'. O id interno vinha de uma variável, e por
 * isso `tests/vocabulario-no-texto.test.ts` (que lê os textos escritos no
 * código) não pegou. O caminho antigo leva à aba Fichas, e os ids antigos
 * são apelidos dela (a tela não chega mais a dizer o id). A aba digitada que
 * não existe segue repetindo o que a pessoa digitou
 * (`tests/decisoes-de-16-11.test.ts`).
 */

describe('a aba antiga das fichas', () => {
  it('o caminho antigo leva à aba Fichas', () => {
    const pagina = readFileSync(join(__dirname, '..', 'app/[slug]/settings/fichas/page.tsx'), 'utf8')
    expect(pagina).toContain('settings?tab=fichas')
    expect(pagina).not.toMatch(/'anamnese'/)
  })

  it('os ids antigos das fichas são apelidos da aba Fichas', () => {
    expect(chaveDaAbaPedida('anamnese')).toBe('fichas')
    expect(chaveDaAbaPedida('atendimento')).toBe('fichas')
    expect(chaveDaAbaPedida('pre-atendimento')).toBe('fichas')
  })
})
