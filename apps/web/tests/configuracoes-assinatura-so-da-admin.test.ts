import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A aba Assinatura é só da Admin da rede (AS-15; o Heitor, 2026-11-18:
 * "Configuração da rede toda só pela conta admin"). Configurações → Geral, na
 * dica do Plano, mandava quem tem “A rede inteira” e não é a Admin "ver faturas
 * e pagamento na aba Assinatura" — onde ela lê "Esta configuração é só da Admin
 * da rede." (princípio 3). O "veja na aba" é só da Admin da rede; aos outros,
 * a dica diz de quem é a assinatura, como na unidade.
 */
const raiz = path.join(__dirname, '..')
const fonte = (f: string) => readFileSync(path.join(raiz, f), 'utf8')

describe('a dica do Plano em Configurações → Geral', () => {
  it('só a Admin da rede é mandada à aba Assinatura', () => {
    const geral = fonte('components/admin/settings-geral.tsx')
    expect(geral).toMatch(/porque=\{naRede && daAdmin \? 'Veja faturas e pagamento na aba Assinatura\.'/)
  })

  it('a tela passa quem é a Admin da rede pelo cargo gravado (ctx.isNetworkAdmin), nunca pela abrangência', () => {
    const tela = fonte('app/_shared/configuracoes.tsx')
    expect(tela).toMatch(/<SettingsGeral[^>]*daAdmin=\{ctx\.isNetworkAdmin\}/)
  })
})
