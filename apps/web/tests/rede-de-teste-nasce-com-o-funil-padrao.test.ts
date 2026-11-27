import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_FUNNEL_NAME, DEFAULT_STAGES } from '@/lib/crm'

// A rede de teste nasce com o funil padrão — o mesmo que o primeiro acesso ao
// CRM cria numa rede de verdade (`seedDefaultFunnel`). No banco local recém-
// preparado ela nascia sem nenhum, e o spec que precisa de uma etapa aberta
// (`permissoes-acoes`) dependia de outro spec ter aberto o quadro antes.
const script = readFileSync(join(__dirname, '../scripts/rede-de-teste.mjs'), 'utf8')

describe('a rede de teste nasce com o funil padrão', () => {
  it('chama crm_funil_padrao, como o primeiro acesso ao CRM', () => {
    expect(script).toMatch(/rpc\('crm_funil_padrao'/)
  })
  it('com o nome e as etapas do sistema (lib/crm.ts)', () => {
    expect(script).toContain(`'${DEFAULT_FUNNEL_NAME}'`)
    for (const e of DEFAULT_STAGES) {
      expect(script).toContain(`{ name: '${e.name}', color: '${e.color}', outcome: '${e.outcome}' }`)
    }
  })
})
