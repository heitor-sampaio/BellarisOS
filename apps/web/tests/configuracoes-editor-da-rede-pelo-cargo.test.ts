import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A comissão (com as taxas, o Pix e o crediário) e a fidelidade são
 * configuração da rede toda: só da Admin da rede, pelo cargo de sistema
 * gravado (o Heitor, 18/11: "Configuração da rede toda só pela conta admin";
 * CLAUDE.md §11, `mexeNaConfigDaRede`). As actions já recusam por ele
 * (`salvarConfigDeComissao`, `salvarMaximoDeParcelas`, `salvarMaquininha`,
 * `salvarTaxaDoPix`, `salvarConfigFidelidade`, `salvarRecompensa`); a tela
 * decidia o editor pela abrangência (`ctx.branchId === null`, a regra de antes
 * de 18/11). A tela e a action leem a mesma regra.
 */
const tela = readFileSync(join(__dirname, '..', 'app', '_shared', 'configuracoes.tsx'), 'utf8')

const podeEditarDe = (componente: string) => {
  const i = tela.indexOf(`<${componente} `)
  expect(i, `${componente} não está na tela`).toBeGreaterThan(-1)
  const fim = tela.indexOf('/>', i)
  const trecho = tela.slice(i, fim)
  const m = trecho.match(/podeEditar=\{([^}]*)\}/)
  expect(m, `${componente} sem podeEditar`).not.toBeNull()
  return m![1]!
}

describe('o editor da configuração da rede toda abre pelo cargo, não pela abrangência', () => {
  for (const c of ['SettingsComissoes', 'FidelidadeConfig', 'FidelidadeCatalogo']) {
    it(`${c}: podeEditar pela Admin da rede (mexeNaConfigDaRede)`, () => {
      const pode = podeEditarDe(c)
      expect(pode).toContain('mexeNaConfigDaRede(ctx)')
      expect(pode).not.toContain('branchId')
    })
  }
})
