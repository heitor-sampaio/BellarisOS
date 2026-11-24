import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Minhas comissões não leva ao Financeiro de quem não o abre (27ª simulação;
 * princípio 7): o "← Financeiro" da vista pessoal volta ao Dashboard.
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
describe('Minhas comissões não leva ao Financeiro de quem não o abre [7]', () => {
  it('o link de volta diz para onde vai, e a vista pessoal volta ao Dashboard', () => {
    const tela = fonte('components/shared/financeiro-comissoes.tsx')
    expect(tela).not.toMatch(/>← Financeiro</)
    expect(tela).toMatch(/← \{p\.voltarRotulo \?\? 'Financeiro'\}/)
    for (const pagina of ['app/[slug]/financeiro/comissoes/page.tsx', 'app/admin/financeiro/comissoes/page.tsx']) {
      expect(fonte(pagina), pagina).toMatch(/voltarRotulo=\{minhas \? 'Dashboard' : 'Financeiro'\}/)
    }
    expect(fonte('app/[slug]/financeiro/comissoes/page.tsx')).toMatch(/voltarPara=\{minhas \? `\/\$\{slug\}\/dashboard` : `\/\$\{slug\}\/financeiro`\}/)
  })
})
