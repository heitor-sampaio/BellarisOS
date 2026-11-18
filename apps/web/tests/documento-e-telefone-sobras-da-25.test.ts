import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { montagemMudou } from '@/lib/documentos/montagem-mudou'

/**
 * A20c e A19 da 25ª simulação.
 *
 * A20c (princípio 3, a Auditoria): reabrir o contrato da venda com o MESMO
 * pagamento gravava de novo — um código de verificação novo e mais uma
 * "geração" na Auditoria —, porque qualquer pagamento passado contava como
 * mudança. Agora se compara o retrato.
 *
 * A19: o telefone do cadastro pela ficha (dados de contato) e pelo app (a
 * própria cliente) gravava o que a pessoa digitou, sem o formato único do
 * cadastro (`telefoneDoCadastro`), e o mesmo número não casava com a conversa.
 */
const WEB = join(__dirname, '..')
const doc = { status: 'PENDENTE', content_sha256: 'h1', missing_fields: [] as string[], payment_snapshot: { forma: 'AVISTA', metodo: 'PIX' } }

describe('A20c: o mesmo pagamento não é montagem nova', () => {
  it('o retrato igual (em outra ordem de chaves) não grava', () => {
    expect(montagemMudou(doc, { status: 'PENDENTE', hash: 'h1', faltando: [], pagamento: { metodo: 'PIX', forma: 'AVISTA' } })).toBe(false)
  })
  it('o retrato diferente grava', () => {
    expect(montagemMudou(doc, { status: 'PENDENTE', hash: 'h1', faltando: [], pagamento: { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 } })).toBe(true)
    expect(montagemMudou({ ...doc, payment_snapshot: null }, { status: 'PENDENTE', hash: 'h1', faltando: [], pagamento: { forma: 'NADA_AGORA' } })).toBe(true)
  })
  it('a montagem lê o retrato gravado e passa o novo', () => {
    const fonte = readFileSync(join(WEB, 'lib/documentos/renderizar.ts'), 'utf8')
    expect(fonte).toMatch(/montagemMudou\(doc, \{ status, hash, faltando, pagamento: retrato \}\)/)
    expect(fonte).toMatch(/p_pagamento: retrato,/)
  })
})

describe('A19: o telefone do cadastro no formato único', () => {
  it('os dados de contato e o "meus dados" do app gravam pelo telefoneDoCadastro', () => {
    const fonte = readFileSync(join(WEB, 'actions/clients.ts'), 'utf8')
    const contato = fonte.slice(fonte.indexOf('export async function updateClientContactData'), fonte.indexOf('export async function updateClientSelf'))
    const app = fonte.slice(fonte.indexOf('export async function updateClientSelf'))
    expect(contato).toMatch(/telefoneDoCadastro\([^)]*\)\?\.gravar \?\? null/)
    expect(app.slice(0, 4000)).toMatch(/telefoneDoCadastro\([^)]*\)\?\.gravar \?\? null/)
  })
})
