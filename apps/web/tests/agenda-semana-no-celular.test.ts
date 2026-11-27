import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * D5 da 39ª (AG-22 e docs/regras/design.md, o celular): a vista Semana da
 * agenda da unidade não se usava a 375 px — a tabela de 7 colunas, presa à
 * largura da tela (`tableLayout: fixed`, 100%), colava os cabeçalhos
 * ("QUAQUI"), cortava o domingo e escrevia o bloqueio uma letra por linha.
 * A grade tem largura mínima por coluna e rola de lado (sem a barra à mostra,
 * como manda o design.md), com a coluna de quem atende parada.
 */
const fonte = readFileSync(join(__dirname, '..', 'components/branch/agenda-week-view.tsx'), 'utf8')

describe('a Semana no celular', () => {
  it('cada dia tem largura mínima, e a tabela não encolhe abaixo dela', () => {
    const m = fonte.match(/const LARGURA_DO_DIA = (\d+)/)
    expect(m, 'a largura mínima do dia').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(100)
    expect(fonte).toMatch(/<table[^>]*minWidth: LARGURA_DA_PRIMEIRA \+ 7 \* LARGURA_DO_DIA/)
  })
  it('a grade rola de lado sem a barra à mostra', () => {
    expect(fonte).toMatch(/className="table-wrap"[^>]*scrollbarWidth: 'none'/)
  })
  it('a coluna de quem atende fica parada na rolagem', () => {
    expect(fonte).toMatch(/const COLUNA_PARADA[^\n]*position: 'sticky', left: 0/)
    expect((fonte.match(/\.\.\.COLUNA_PARADA/g) ?? []).length, 'o cabeçalho, as salas e cada pessoa').toBeGreaterThanOrEqual(3)
  })
})
