import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * D9 da 35ª simulação (UN-13, UN-15; CLAUDE.md §14, `unidadesParaLer`): a
 * Minha agenda dizia "Na unidade outra unidade" para os horários de uma
 * unidade desativada. A página lia os nomes por `getCachedNetworkBranches`
 * (só as ativas) e caía no nome de reserva. Os nomes saem das unidades de
 * LEITURA (a desativada com o que ficou, ou com movimento na janela da
 * agenda), com o selo da desativada (`nomeNaTela`).
 */
const PAGINA = fs.readFileSync(path.resolve(__dirname, '..', 'app', '[slug]', 'agenda', 'page.tsx'), 'utf8')

describe('D9: a Minha agenda diz o nome da unidade desativada', () => {
  it('os nomes das unidades não saem das só ativas', () => {
    expect(PAGINA).not.toMatch(/getCachedNetworkBranches\(/)
  })
  it('saem de unidadesParaLer, com a janela da agenda e o selo da desativada', () => {
    expect(PAGINA).toMatch(/unidadesParaLer\(ctx\.tenantId!?,\s*\{\s*periodo:/)
    expect(PAGINA).toMatch(/nomeNaTela\(/)
  })
})
