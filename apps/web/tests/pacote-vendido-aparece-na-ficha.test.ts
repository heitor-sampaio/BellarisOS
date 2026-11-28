import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A12 da 43ª (princípio 3; CLAUDE.md §14 — expirar é `revalidateTag(tag, {
 * expire: 0 })`): depois da venda do pacote, a ficha da cliente mostrou
 * "Nenhum pacote ativo" por ~30 s. Os pacotes da ficha moram no cache dela
 * (`getCachedClientProfileData`, tag `client:<id>`, 60 s), e a venda só
 * revalidava os caminhos — o cancelar e o trazer de fora já expiravam a tag.
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

function corpo(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.search(new RegExp(`(async )?function ${nome}\\b`))
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const fim = f.indexOf('\n// ---', i + 10)
  return f.slice(i, fim < 0 ? undefined : fim)
}

describe('o pacote vendido aparece na ficha na hora', () => {
  it('os pacotes da ficha se leem com a tag da cliente', () => {
    const c = fonte('lib/cached-queries.ts')
    const ficha = c.slice(c.indexOf('export function getCachedClientProfileData'))
    expect(ficha).toContain(".from('client_packages')")
    expect(ficha).toContain('`client:${clientId}`')
  })

  it('a venda do pacote expira a ficha da cliente', () => {
    expect(corpo('actions/pacotes.ts', 'venderPacoteUmaVez')).toContain('revalidateTag(`client:${clienteId}`, { expire: 0 })')
  })
})
