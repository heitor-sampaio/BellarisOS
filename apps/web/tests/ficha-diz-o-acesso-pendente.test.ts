import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A4 da 31ª simulação (princípios 3 e 7): a ficha dizia só "Tem acesso ao app"
 * enquanto o acesso esperava a pessoa criar a senha pelo e-mail (PO-14). O
 * texto é o de `lerAcessoPendente` (lib/clients/acesso-pendente.ts, provado em
 * tests/acesso-pendente-na-ficha.test.ts); aqui, que as duas fichas o leem e a
 * tela o mostra perto do selo do acesso.
 *
 * A3 da 31ª (princípio 3): a data da linha do tempo é a do PRIMEIRO acesso
 * (`app_account_created_at`, gravada na primeira entrada no app), não a da
 * criação do login — o título diz isso.
 */
const ler = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r/g, '')
const PAGINAS = ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']

describe('a ficha diz o acesso ao app que espera a pessoa', () => {
  for (const f of PAGINAS) {
    it(`${f} lê o acesso pendente pelo login e pelo primeiro acesso`, () => {
      const t = ler(f)
      expect(t).toContain("import { lerAcessoPendente } from '@/lib/clients/acesso-pendente'")
      expect(t).toMatch(/acessoPendente:\s+soProntuario \? null : await lerAcessoPendente\(admin, \{ authId: raw\.auth_id \?\? null, primeiroAcessoEm: raw\.app_account_created_at \?\? null \}\)/)
    })
  }
  it('a tela mostra o texto perto do selo "Tem acesso ao app", como texto secundário', () => {
    const t = ler('components/branch/client-profile.tsx')
    expect(t).toMatch(/acessoPendente\?:\s+string \| null/)
    expect(t).toMatch(/client\.temAcesso && client\.acessoPendente && \(\s*<p data-acesso-pendente[^>]*color: 'var\(--text-muted\)'[^>]*>\s*\{client\.acessoPendente\}/)
  })
})

describe('a linha do tempo diz "Primeiro acesso ao app"', () => {
  for (const f of PAGINAS) {
    it(`${f}: o título é o do primeiro acesso`, () => {
      const t = ler(f)
      expect(t).toMatch(/type: 'APP_ACCOUNT', title: 'Primeiro acesso ao app'/)
      expect(t).not.toContain('Conta criada no app')
    })
  }
})
