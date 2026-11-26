import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chipDaComissao } from '@/lib/comissoes/chip-do-membro'

/**
 * A11 da 34ª simulação (design.md, "Tabela com coluna de ações cabe no
 * cartão"): o chip "Venda: a do pacote ou produto vendido (sem ela, a da rede:
 * …)" ficava cortado no meio — a quebra em duas linhas cabia ~60 caracteres
 * (200 px), e o texto chega a ~90. O texto é o que a regra pede (o Heitor,
 * 25/11: "Diz o percentual da rede"); o que muda é a largura do span, que tem
 * de levar o mais longo em duas linhas.
 */
const WEB = join(__dirname, '..')
const ler = (rel: string) => readFileSync(join(WEB, rel), 'utf8')
// Hanken Grotesk 11,5 px em negrito (o .chip): ~6,4 px por caractere, com folga.
const PX_POR_CARACTERE = 6.4

describe('A11: o chip da comissão de venda cabe inteiro em duas linhas', () => {
  it('a largura do span leva o texto mais longo do chip', () => {
    const textos = [
      chipDaComissao({ padrao: null, excecoes: 0, vendaPct: null, atende: false, vendaDaRede: { plano: 5, produto: 2.5 } }),
      chipDaComissao({ padrao: null, excecoes: 0, vendaPct: null, atende: false, vendaDaRede: { plano: null, produto: 3 } }),
      chipDaComissao({ padrao: null, excecoes: 0, vendaPct: null, atende: false, vendaDaRede: { plano: 12.5, produto: 2.75 } }),
    ]
    const maisLongo = Math.max(...textos.map(t => t.length))
    const fonte = ler('components/admin/comissao-do-membro.tsx')
    const m = /<span data-texto-do-chip style=\{\{[^}]*maxWidth: (\d+)/.exec(fonte)
    expect(m).not.toBeNull()
    const largura = Number(m![1])
    expect(2 * largura).toBeGreaterThanOrEqual(maisLongo * PX_POR_CARACTERE)
  })
})
