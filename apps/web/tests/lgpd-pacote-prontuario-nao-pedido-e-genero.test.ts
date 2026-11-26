import { describe, it, expect } from 'vitest'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import { textoDoProntuarioForaDoPacote } from '@/lib/lgpd/situacao-do-prontuario'
import { generoNoPacote } from '@/lib/lgpd/cadastro-legivel'

// D18 da 31ª simulação (LG-07, LG-11): a Sabrina pediu os dados SEM o
// prontuário, e o PDF dizia "procure a unidade" — como se faltasse algo que ela
// pediu. E o gênero saía abreviado ("F").
describe('o PDF da LGPD sem o prontuário que não foi pedido', () => {
  for (const situacao of ['not_requested', null] as const) {
    it(`diz que não foi pedido e como pedir (${situacao})`, () => {
      const pdf = textoDoProntuarioForaDoPacote(situacao).pdf.join(' ')
      expect(pdf).toMatch(/Você não pediu o prontuário/)
      expect(pdf).toMatch(/Incluir também meu prontuário/)
      expect(pdf).toMatch(/Perfil/)
      expect(pdf).not.toMatch(/procure a unidade/i)
    })
  }
})

describe('o gênero no pacote, por extenso', () => {
  it('cada código da ficha vira o nome que o cadastro mostra', () => {
    expect(generoNoPacote('F')).toBe('Feminino')
    expect(generoNoPacote('M')).toBe('Masculino')
    expect(generoNoPacote('O')).toBe('Outro')
    expect(generoNoPacote('N')).toBe('Prefiro não informar')
    expect(generoNoPacote(null)).toBeNull()
    expect(generoNoPacote('')).toBeNull()
  })
  it('o PDF e o JSON usam o nome, não o código', () => {
    const fonte = nodeFs.readFileSync(nodePath.join(__dirname, '..', 'lib/lgpd/export.ts'), 'utf8')
    expect(fonte).not.toMatch(/String\(client\.gender/)
    expect(fonte).not.toMatch(/genero: client\.gender/)
    expect(fonte.match(/generoNoPacote\(client\.gender\)/g)?.length).toBe(2)
  })
})

// A3 da 31ª (princípio 3): `app_account_created_at` é a hora do PRIMEIRO
// ACESSO (o portal a grava na primeira entrada), não a da criação da conta — e o
// pacote dizia "criada em".
describe('a conta no app, no pacote, diz o que a hora é', () => {
  it('o PDF e o JSON chamam de primeiro acesso', async () => {
    const { linhaDaContaNoApp } = await import('@/lib/lgpd/cadastro-legivel')
    expect(linhaDaContaNoApp({ primeiroAcessoEm: '25/11/2026', temLogin: true })).toBe('primeiro acesso em 25/11/2026')
    expect(linhaDaContaNoApp({ primeiroAcessoEm: null, temLogin: true })).toBe('acesso criado, ainda sem entrada no app')
    expect(linhaDaContaNoApp({ primeiroAcessoEm: null, temLogin: false })).toBe('não possui')
    const fonte = nodeFs.readFileSync(nodePath.join(__dirname, '..', 'lib/lgpd/export.ts'), 'utf8')
    expect(fonte).not.toMatch(/criadaEm: client\.app_account_created_at/)
    expect(fonte).toMatch(/primeiroAcesso: client\.app_account_created_at/)
    expect(fonte).not.toMatch(/`criada em \$\{fmtDate\(client\.app_account_created_at\)\}`/)
  })
})
