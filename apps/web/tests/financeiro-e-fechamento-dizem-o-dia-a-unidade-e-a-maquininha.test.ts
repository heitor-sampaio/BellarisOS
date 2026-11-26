import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diaSemHora } from '@/lib/financeiro/vencimentos'
import { textoDoSemEspecie, comODia, regraDosCamposDoFechamento, porQueNaoSeConfere, detalheDasBandeirasEmTexto, type LinhaDaConferencia } from '@/lib/financeiro/conferencia-do-fechamento'

/**
 * O Financeiro e o Fechamento do dia dizem o que é (princípio 3).
 *
 * A24: o lançamento pago só com a data (o dia escolhido, sem hora) aparecia
 * "25/11, 10:00" — a hora era a âncora do registro (meio-dia de Brasília), não
 * a do pagamento; o fechamento de um dia passado dizia "Sem espécie hoje"; o
 * estorno não dizia a maquininha (o contra-lançamento é saída, e a saída não
 * leva maquininha: é a do pagamento estornado); e a forma sem bandeira
 * nenhuma listava "Bandeira não informada".
 * A30: o fechamento da rede não dizia de que unidade é o detalhe; a forma só
 * com saída não se confere (FC-10), mas a linha não dizia por quê.
 * A25: Relatórios → Financeiro listava só as parcelas, e o cartão
 * "A receber · em aberto" (FN-11) conta também o "A receber": a mesma régua.
 */

const WEB = join(__dirname, '..')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')
const linha = (mais: Partial<LinhaDaConferencia>): LinhaDaConferencia => ({
  forma: 'PIX', entradas: 0, saidas: 0, registrado: 0, conferivel: false, conferido: null, diferenca: null,
  mudouDepois: false, registradoNoFechamento: null, ...mais,
} as LinhaDaConferencia)

describe('A24: o pago só com a data mostra só a data', () => {
  it('a âncora do dia (meio-dia de Brasília) é "só a data"', () => {
    expect(diaSemHora('2026-11-25T15:00:00.000Z')).toBe('2026-11-25')
    expect(diaSemHora('2026-11-25T15:00:00+00:00')).toBe('2026-11-25')
  })
  it('a hora de verdade não é', () => {
    expect(diaSemHora('2026-11-25T15:00:01.000Z')).toBeNull()
    expect(diaSemHora('2026-11-25T13:42:10.512Z')).toBeNull()
    expect(diaSemHora(null)).toBeNull()
  })
  it('a lista do Financeiro da unidade usa', () => {
    expect(ler('components/branch/financial-table.tsx')).toMatch(/diaSemHora\(/)
  })
})

describe('A24: o fechamento de outro dia diz o dia', () => {
  it('hoje, "hoje"; outro dia, o dia', () => {
    expect(textoDoSemEspecie('2026-11-26', '2026-11-26')).toBe('Sem espécie hoje: em branco é R$ 0,00.')
    expect(textoDoSemEspecie('2026-11-25', '2026-11-26')).toBe('Sem espécie em 25/11: em branco é R$ 0,00.')
  })
  it('o rodapé dos campos também', () => {
    expect(comODia(regraDosCamposDoFechamento(true), '2026-11-25', '2026-11-26'))
      .toMatch(/^Sem dinheiro em espécie em 25\/11: o dinheiro em branco fecha em R\$\s0,00\./)
    expect(comODia(regraDosCamposDoFechamento(true), '2026-11-26', '2026-11-26')).toBe(regraDosCamposDoFechamento(true))
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('comODia(regraDosCamposDoFechamento(semDinheiro), dia, hoje)')
  })
  it('a tela usa o texto', () => {
    const t = ler('components/shared/fechamento-do-dia-tela.tsx')
    expect(t).toContain('textoDoSemEspecie(dia, hoje)')
    expect(t).not.toContain('Sem espécie hoje: em branco é R$ 0,00.')
  })
})

describe('A24: a bandeira só aparece onde há bandeira', () => {
  const b = (forma: string, bandeira: string | null, entradas: number, maquininha: string | null = null) =>
    ({ forma, maquininha, bandeira, entradas, saidas: 0, lancamentos: 1 })
  it('a forma sem bandeira nenhuma não lista "Bandeira não informada"', () => {
    expect(detalheDasBandeirasEmTexto('PIX', [b('PIX', null, 120)], false)).toBeNull()
  })
  it('com várias maquininhas, a sem bandeira diz só a maquininha', () => {
    expect(sp(detalheDasBandeirasEmTexto('DEBIT_CARD', [b('DEBIT_CARD', null, 100, 'Cielo'), b('DEBIT_CARD', 'VISA', 50, 'Stone')], true)))
      .toBe('Cielo: R$ 100,00 · Stone: Visa R$ 50,00')
  })
  it('entre bandeiras, a não informada segue dita', () => {
    expect(sp(detalheDasBandeirasEmTexto('CREDIT_CARD', [b('CREDIT_CARD', 'VISA', 50), b('CREDIT_CARD', null, 30)], false)))
      .toBe('Visa R$ 50,00 · Bandeira não informada R$ 30,00')
  })
  it('a tela usa o texto', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('detalheDasBandeirasEmTexto(forma, bandeiras, variasMaquininhas)')
  })
})

describe('A24: o estorno diz a maquininha do pagamento estornado', () => {
  it('o leitor acha a maquininha pelo estorno_de', () => {
    const t = ler('lib/financeiro/maquininha-do-estorno.ts')
    expect(t).toContain(".select('id, estorno_de, branches!inner(tenant_id)')")
    expect(t).toContain(".select('id, maquininha_id, branches!inner(tenant_id)')")
    expect(t.match(/\.eq\('branches\.tenant_id', tenantId\)/g)).toHaveLength(2)
  })
  it('o Financeiro da unidade, o da rede e o Fechamento do dia o usam', () => {
    expect(ler('app/[slug]/financeiro/page.tsx')).toMatch(/maquininhaDosEstornos\(/)
    expect(ler('app/admin/financeiro/page.tsx')).toMatch(/maquininhaDosEstornos\(/)
    expect(ler('lib/metrics/fechamento-extra.ts')).toMatch(/maquininhaDosEstornos\(/)
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toMatch(/rotuloDaForma\(e\.forma, e\.vezes, \{ maquininha: e\.maquininha \}\)/)
  })
})

describe('A30: o fechamento da rede diz a unidade, e a forma só com saída diz por que não se confere', () => {
  it('a unidade no detalhe', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('data-unidade-do-fechamento')
  })
  it('só saída: não há entrada a conferir', () => {
    expect(porQueNaoSeConfere(linha({ forma: 'PIX', saidas: 80 }))).toBe('Só saída neste dia: não há entrada a conferir.')
    expect(porQueNaoSeConfere(linha({ forma: 'PIX', conferivel: true, entradas: 10 }))).toBeNull()
    expect(porQueNaoSeConfere(linha({ forma: 'SEM_FORMA', saidas: 80 }))).toBeNull()
    expect(porQueNaoSeConfere(linha({ forma: 'DEBIT_CARD' })), 'a zerada pelo estorno de hoje já diz o estorno').toBeNull()
  })
  it('a tela diz', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toContain('porQueNaoSeConfere(l)')
  })
})

describe('A25: a lista do a receber dos Relatórios usa a régua do cartão', () => {
  it('não só as parcelas: o "A receber" também', () => {
    const s = ler('components/admin/reports-bi-section.tsx')
    const trecho = s.slice(s.indexOf('needInstall\n'), s.indexOf("'carregar as parcelas a receber'"))
    expect(trecho).not.toContain(".not('parcela_total', 'is', null)")
    expect(trecho).toContain("category.neq.Estorno")
  })
  it('o título diz o que é', () => {
    expect(ler('components/admin/reports-bi-view.tsx')).toContain('title="A receber em aberto"')
  })
})
