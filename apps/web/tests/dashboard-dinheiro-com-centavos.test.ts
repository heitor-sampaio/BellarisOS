import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O dashboard da unidade mostra o dinheiro com os centavos (princípio 3: "o
 * que a tela mostra é o que vale na conta"). As comissões de R$ 192,50
 * apareciam como "R$ 193 lançados" — o `formatBRL` da página arredondava ao
 * real (`maximumFractionDigits: 0`). O dashboard da rede já mostra os centavos.
 */
const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')

describe('o dinheiro do dashboard com os centavos', () => {
  it('o da unidade não arredonda ao real', () => {
    const t = ler('app/[slug]/dashboard/page.tsx')
    expect(t).not.toMatch(/maximumFractionDigits:\s*0/)
    expect(t).toMatch(/\{formatBRL\(minhasComissoes\.lancado\)\} lançados em/)
  })
  it('o da rede também não (o ranking das comissões e os cartões)', () => {
    const t = ler('components/admin/admin-dashboard-view.tsx')
    expect(t).not.toMatch(/maximumFractionDigits:\s*0/)
  })
})
