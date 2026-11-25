import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { resumoDoQueFica, temOQueFicou, caminhosDoQueFica, NADA_FICA, type OQueFicaNaUnidade } from '@/lib/unidades/o-que-fica'

/**
 * plataforma:UN-10 (princípio 3; o a receber da operadora: decisão do Claude,
 * 25/11). A janela de desativar a unidade contava o a receber das clientes e
 * calava o da OPERADORA (os cartões a cair): os R$ 200 do crédito em 2x da
 * unidade não apareciam. O número é o "em aberto" da operadora do Financeiro
 * (`getAReceberDaOperadora`, lib/metrics/operadora.ts), com o nome dele.
 */

const tudo = (o: Partial<OQueFicaNaUnidade>): OQueFicaNaUnidade => ({ ...NADA_FICA, ...o })
const sp = (s: string) => s.replace(/[  ]/g, ' ')

describe('o a receber da operadora na janela de desativar', () => {
  it('o resumo diz, com o nome do Financeiro', () => {
    expect(sp(resumoDoQueFica('Pampulha', tudo({ aReceberDaOperadora: 200 }))!))
      .toBe('A unidade Pampulha tem R$ 200,00 a receber da operadora (os cartões a cair).')
    expect(sp(resumoDoQueFica('Pampulha', tudo({ aReceber: 330, aReceberDaOperadora: 200 }))!))
      .toBe('A unidade Pampulha tem R$ 330,00 a receber e R$ 200,00 a receber da operadora (os cartões a cair).')
  })
  it('conta como o que ficou, e leva ao a receber dela', () => {
    expect(temOQueFicou(tudo({ aReceberDaOperadora: 200 }))).toBe(true)
    expect(caminhosDoQueFica('u1', tudo({ aReceberDaOperadora: 200 })).map(c => c.chave)).toEqual(['a-receber'])
  })
  it('a leitura sai da conta do Financeiro (lib/metrics)', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'lib', 'unidades', 'desativar.ts'), 'utf8')
    expect(fonte).toContain("from '@/lib/metrics/operadora'")
    expect(fonte).toContain('aReceberDaOperadora:')
  })
})
