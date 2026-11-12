import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePeriod } from '@/lib/metrics/period'
import { DEFINICOES } from '@/lib/metrics/definicoes'
import { vazioDoReativar } from '@/components/shared/quadros-de-clientes'

/**
 * F68 — os indicadores (levantamento C45–C50, C5; sim13 D10, A10). As contas
 * no banco têm o seu E2E (`e2e/indicadores-f68-contas.spec.ts`); aqui, as
 * contas puras de lib/metrics e a trava de que a tela não soma por conta.
 */

const RAIZ = join(__dirname, '..')
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), 'utf8')

// 12/11/2026, 12:00 em São Paulo — mês pela metade.
const AGORA = new Date('2026-11-12T15:00:00Z')

describe('C46: o período anterior INTEIRO (o "A receber" e o "A pagar" vão até o fim do período)', () => {
  it('"Este mês" compara com o mês anterior inteiro, não com a parte decorrida', async () => {
    const p = resolvePeriod('month', undefined, undefined, AGORA) as ReturnType<typeof resolvePeriod> & { prevFullTo?: Date }
    expect(p.prevFullTo?.toISOString()).toBe('2026-11-01T02:59:59.999Z')
    // O decorrido continua para o que conta até agora (a receita).
    expect(p.prevTo.toISOString()).toBe('2026-10-12T15:00:00.000Z')
  })

  it('"Hoje" compara com ontem inteiro', () => {
    const p = resolvePeriod('today', undefined, undefined, AGORA) as ReturnType<typeof resolvePeriod> & { prevFullTo?: Date }
    expect(p.prevFullTo?.toISOString()).toBe('2026-11-12T02:59:59.999Z')
  })
})

describe('C46: o "▲ no semestre" compara meses FECHADOS, e a conta é de lib/metrics', () => {
  it('o último mês fechado contra o primeiro, com os meses no rótulo', async () => {
    const m = await import('@/lib/metrics/evolucao') as Record<string, unknown>
    const variacaoDoSemestre = m.variacaoDoSemestre as ((s: { label: string; value: number }[]) => { valor: number; de: string; ate: string } | null) | undefined
    expect(variacaoDoSemestre, 'variacaoDoSemestre em lib/metrics/evolucao').toBeTypeOf('function')
    const serie = [
      { label: 'jun', value: 1000 }, { label: 'jul', value: 1500 }, { label: 'ago', value: 1200 },
      { label: 'set', value: 1800 }, { label: 'out', value: 2500 }, { label: 'nov', value: 300 },
    ]
    // O mês corrente (nov, pela metade) não entra: out − jun.
    expect(variacaoDoSemestre!(serie)).toEqual({ valor: 1500, de: 'jun', ate: 'out' })
    expect(variacaoDoSemestre!([{ label: 'nov', value: 10 }])).toBeNull()
  })

  it('o dashboard da unidade não faz a conta do semestre na tela', () => {
    expect(ler('app/[slug]/dashboard/page.tsx')).not.toMatch(/chartData\[5\][^\n]*-\s*\(?chartData\[0\]/)
  })
})

describe('C46/C17: as somas das comissões e a variação vêm de lib/metrics', () => {
  it('totaisDoResumoDasComissoes soma as linhas do resumo, ao centavo', async () => {
    const m = await import('@/lib/metrics/comissoes').catch(() => ({})) as Record<string, unknown>
    const totais = m.totaisDoResumoDasComissoes as ((l: { aPagar: number; liberado: number; pago: number; aguardando: number }[]) => Record<string, number>) | undefined
    expect(totais, 'totaisDoResumoDasComissoes em lib/metrics/comissoes').toBeTypeOf('function')
    expect(totais!([
      { aPagar: 0.1, liberado: 0.2, pago: 0, aguardando: 0 },
      { aPagar: 0.2, liberado: 0.1, pago: 1.006, aguardando: 3 },
    ])).toEqual({ aPagar: 0.3, liberado: 0.3, pago: 1.01, aguardando: 3 })
  })

  it('totaisDasComissoes: o total, o pago e cada profissional', async () => {
    const m = await import('@/lib/metrics/comissoes').catch(() => ({})) as Record<string, unknown>
    const totais = m.totaisDasComissoes as ((e: { professionalId: string; professionalName: string; amount: number; isPaid: boolean }[]) => {
      total: number; pago: number; porProfissional: { id: string; name: string; total: number; itens: unknown[] }[]
    }) | undefined
    expect(totais, 'totaisDasComissoes em lib/metrics/comissoes').toBeTypeOf('function')
    const r = totais!([
      { professionalId: 'a', professionalName: 'Ana', amount: 10.1, isPaid: true },
      { professionalId: 'b', professionalName: 'Bia', amount: 5, isPaid: false },
      { professionalId: 'a', professionalName: 'Ana', amount: 0.2, isPaid: false },
    ])
    expect(r.total).toBe(15.3)
    expect(r.pago).toBe(10.1)
    expect(r.porProfissional.map(p => [p.id, p.total, p.itens.length])).toEqual([['a', 10.3, 2], ['b', 5, 1]])
  })

  it('nenhuma tela soma comissão nem tem a sua cópia do delta()', () => {
    const hub = ler('components/branch/financial-hub.tsx')
    expect(hub).not.toMatch(/function delta\(/)
    expect(hub).not.toMatch(/\.reduce\(\(s, (e|i)\) => s \+ (e|i)\.amount/)
    expect(ler('app/[slug]/dashboard/page.tsx')).not.toMatch(/linhas\.reduce/)
    expect(ler('app/_shared/comissoes-da-equipe.tsx')).not.toMatch(/resumo\.reduce/)
  })

  it('o hub compara o "A receber" e o "A pagar" com o anterior INTEIRO', () => {
    const pagina = ler('app/[slug]/financeiro/page.tsx')
    expect(pagina).toMatch(/getEmAberto\(\{[^}]*prevFullTo/)
    expect(pagina).not.toMatch(/getAPagar\(/)
  })
})

describe('D10: os números "Meus" de quem atende em mais de uma unidade', () => {
  it('unidadesDoQueEDela: a unidade do endereço e as outras em que ela atende, só no "só os meus"', async () => {
    const m = await import('@/lib/metrics/escopo') as Record<string, unknown>
    const f = m.unidadesDoQueEDela as ((ctx: unknown, unidade: string, modulo: 'agenda' | 'financial') => string[]) | undefined
    expect(f, 'unidadesDoQueEDela em lib/metrics/escopo').toBeTypeOf('function')
    const dela = { scopes: { agenda: 'OWN', financial: 'ALL' }, internalUserId: 'u1', atendeEm: ['B', 'A'] }
    expect(f!(dela, 'A', 'agenda')).toEqual(['A', 'B'])
    expect(f!(dela, 'A', 'financial')).toEqual(['A'])
    expect(f!({ ...dela, atendeEm: [] }, 'A', 'agenda')).toEqual(['A'])
  })
})

describe('A10: cada quadro de clientes diz o seu recorte', () => {
  it('o vazio do "Reativar" diz de quais clientes fala', () => {
    const texto = (vazioDoReativar as (a: number, b: number, recorte?: string) => string)(3, 5, 'que frequentam a unidade')
    expect(texto).toContain('5 clientes que frequentam a unidade, cadastradas nos últimos 90 dias')
  })

  it('o "Clientes no mês" da unidade diz que são as que frequentam a unidade', () => {
    expect(ler('app/[slug]/dashboard/page.tsx')).toMatch(/que frequentam a unidade/)
  })
})

describe('C47: o cartão de marketing usa o período escolhido e o alcance da conta', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('intervaloDosAnuncios: mês, 15 dias e personalizado vão com as datas, não com 30 dias', async () => {
    const m = await import('@/lib/ads/periodo').catch(() => ({})) as Record<string, unknown>
    const f = m.intervaloDosAnuncios as ((p: ReturnType<typeof resolvePeriod>, tz?: string) => unknown) | undefined
    expect(f, 'intervaloDosAnuncios em lib/ads/periodo').toBeTypeOf('function')
    expect(f!(resolvePeriod('month', undefined, undefined, AGORA))).toEqual({ preset: '30d', since: '2026-11-01', until: '2026-11-12' })
    expect(f!(resolvePeriod('15d', undefined, undefined, AGORA))).toEqual({ preset: '30d', since: '2026-10-29', until: '2026-11-12' })
    expect(f!(resolvePeriod('custom', '2026-09-01', '2026-09-30', AGORA))).toEqual({ preset: '30d', since: '2026-09-01', until: '2026-09-30' })
    expect(f!(resolvePeriod('today', undefined, undefined, AGORA))).toEqual({ preset: 'today' })
    expect(f!(resolvePeriod('all', undefined, undefined, AGORA))).toEqual({ preset: 'all' })
  })

  it('o resumo da conta pede o alcance à Meta no nível da conta (a pessoa conta uma vez) e no intervalo', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ data: [{ spend: '120.50', reach: '700' }] }), { status: 200 })
    }))
    const { MetaAdsProvider } = await import('@/lib/ads/meta')
    const p = new MetaAdsProvider({ provider: 'meta_ads', adAccountId: '1', accessToken: 't', pixelId: 'x' }) as unknown as {
      getResumoDaConta?: (r: { preset: string; since?: string; until?: string }) => Promise<{ spend: number; reach: number }>
    }
    expect(p.getResumoDaConta, 'MetaAdsProvider.getResumoDaConta').toBeTypeOf('function')
    expect(await p.getResumoDaConta!({ preset: '30d', since: '2026-11-01', until: '2026-11-12' })).toEqual({ spend: 120.5, reach: 700 })
    const url = decodeURIComponent(urls[0]!)
    expect(url).toContain('/act_1/insights?')
    expect(url).toContain('"since":"2026-11-01"')
    expect(url).toContain('"until":"2026-11-12"')
    expect(url).not.toContain('last_30d')
  })

  it('o dashboard da rede não soma o alcance das campanhas', () => {
    expect(ler('app/admin/dashboard/page.tsx')).not.toMatch(/campaigns\.reduce/)
  })
})

describe('C48: sem base, "—" e não zero', () => {
  it('a ocupação do dia sem capacidade não vira 0%', () => {
    expect(ler('app/[slug]/dashboard/page.tsx')).not.toMatch(/occupancyPct\([^)]*\)\s*\?\?\s*0/)
  })

  it('o ticket da rede sem cliente pagante é "—"', () => {
    expect(ler('app/admin/dashboard/page.tsx')).not.toMatch(/ticketMedio\s*=\s*ticket\?\.total\.valor \?\? 0/)
  })
})

describe('C50: as dicas dizem a conta de hoje', () => {
  it('sem "horário de Brasília" (o dia é o do fuso da unidade, F62)', () => {
    for (const d of Object.values(DEFINICOES)) expect(d.texto).not.toMatch(/Brasília/)
  })

  it('a receita diz que o estorno sai no dia dele, não "sem estornos"', () => {
    expect(DEFINICOES.receita.texto).not.toMatch(/sem estornos/)
    expect(DEFINICOES.receita.texto).toMatch(/estorno/)
  })

  it('os insumos: a perda e o ajuste são métrica, não "já foi pago na compra"', () => {
    expect(DEFINICOES.insumosEProdutos.texto).not.toMatch(/já foi pago na compra/)
  })
})

describe('C5: o Copilot usa as mesmas funções da tela', () => {
  const copilot = () => ler('lib/copilot/ferramentas/indicadores.ts')

  it('o comercial é o painel dos Relatórios (os funis ativos, motivos e origem)', () => {
    expect(copilot()).toMatch(/painelComercial\(/)
    expect(copilot()).not.toMatch(/getLeadFunnel\(/)
    expect(ler('components/admin/reports-bi-section.tsx')).toMatch(/from '@\/lib\/metrics\/painel-comercial'/)
  })

  it('o "a receber" é o do Financeiro (pelo vencimento, até o fim do período)', () => {
    expect(copilot()).toMatch(/getEmAberto\(\{[^}]*fullTo/)
    expect(copilot()).not.toMatch(/aReceber: dinheiro\(atual\.revenuePending\)/)
  })

  it('a aba agenda vai até o fim do período, como a tela', () => {
    expect(copilot()).toMatch(/aba === 'agenda' \? periodo\.fullTo/)
  })
})
