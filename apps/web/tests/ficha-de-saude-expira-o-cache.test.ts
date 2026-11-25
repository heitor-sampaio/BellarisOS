import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Salvar a ficha de saúde expira, na hora, o cache da ficha da cliente
 * (`getCachedClientProfileData`, tag `client:<id>`, 60 s): sem isso, a tela
 * mostrava a ficha vazia logo depois de salva (princípio 3; CLAUDE.md §14 —
 * expirar é `revalidateTag(tag, { expire: 0 })`).
 */
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

function corpo(arquivo: string, nome: string): string {
  const f = fonte(arquivo)
  const i = f.search(new RegExp(`(async )?function ${nome}\\b`))
  if (i < 0) throw new Error(`${nome} não está em ${arquivo}`)
  const fim = f.indexOf('\nexport ', i + 10)
  return f.slice(i, fim < 0 ? undefined : fim)
}

describe('a ficha de saúde salva aparece na hora', () => {
  it('a ficha da cliente se lê com a tag da cliente', () => {
    expect(fonte('lib/cached-queries.ts')).toContain('`client:${clientId}`')
  })

  it('salvarAnamneseGeral (a equipe) expira a ficha da cliente', () => {
    expect(corpo('actions/pre-atendimento.ts', 'salvarAnamneseGeral')).toContain('expirarAFichaDaCliente(dados.data.clientId)')
  })

  it('responderPorLink (o link público) expira a ficha da cliente', () => {
    expect(corpo('lib/pre-atendimento/link-publico.ts', 'responderPorLink')).toContain('expirarAFichaDaCliente(c.cliente)')
  })

  // O app da cliente: a expiração vai no after() — fora da resposta da action,
  // ela não marca a página da cliente para recarregar (o "Respostas enviadas"
  // fica na tela), e a equipe vê a ficha nova na hora.
  for (const nome of ['responderPreAtendimento', 'confirmarQueNadaMudou']) {
    it(`${nome} (o app da cliente) expira a ficha da cliente depois da resposta, no after()`, () => {
      const c = corpo('actions/pre-atendimento-cliente.ts', nome)
      expect(c).toContain('after(() => expirarAFichaDaCliente(ctx.clientId!))')
      expect(c).not.toMatch(/^\s*expirarAFichaDaCliente\(/m)
      expect(c).not.toMatch(/revalidate(Tag|Path)\(/)
    })
  }

  it('a expiração é a da cliente, na hora', () => {
    const c = corpo('lib/pre-atendimento/ficha.ts', 'expirarAFichaDaCliente')
    expect(c).toContain('revalidateTag(`client:${clientId}`, { expire: 0 })')
  })
})
