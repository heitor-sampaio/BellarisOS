import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * docs/regras/plataforma.md (Auditoria): "O nome da cliente e do membro se lê
 * na hora de mostrar (`lib/auditoria/frase.ts`)", e dos registros vão "os nomes
 * e uma lista curta de valores sem dado pessoal".
 *
 * A entrada da cliente (`auditoria_registrar_entrada_da_cliente`) gravava o
 * NOME dela em `ator_nome`, numa tabela que não se altera: o único ponto em que
 * a Auditoria guardava o nome de uma cliente. Os gatilhos gravam "A cliente,
 * pelo portal" e a ficha (`ator_cliente_id`), e a tela lê o nome da ficha na
 * hora. A entrada passa a gravar igual (arremate da 41ª, decisão do Claude,
 * 28/11).
 */
const pasta = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const ultima = readdirSync(pasta).filter(n => n.endsWith('.sql')).sort()
  .map(n => readFileSync(join(pasta, n), 'utf8').replace(/\r/g, ''))
  .filter(t => /create or replace function public\.auditoria_registrar_entrada_da_cliente\(p_client uuid\)/.test(t))
  .pop()!

describe('a entrada da cliente na Auditoria não guarda o nome dela', () => {
  it('grava "A cliente, pelo portal" e a ficha, como os gatilhos', () => {
    const corpo = ultima.slice(ultima.indexOf('create or replace function public.auditoria_registrar_entrada_da_cliente'))
    expect(corpo).not.toMatch(/c\.name/)
    expect(corpo).toMatch(/'A cliente, pelo portal'/)
    expect(corpo).toMatch(/ator_cliente_id/)
  })

  it('a tela lê o nome da ficha na hora', () => {
    const frase = readFileSync(join(__dirname, '..', 'lib/auditoria/frase.ts'), 'utf8')
    expect(frase).toMatch(/const ficha = r\.ator_cliente_id \?\?/)
    expect(frase).toMatch(/r\.operacao === 'entrou' \? nome :/)
  })
})
