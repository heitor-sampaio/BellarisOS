import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os atritos da 23ª simulação (2026-11-17) da importação, dos funis, do CEP do
 * setup e do comercial — a regra pura e o que a tela passa a usar.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

// ─── A5 ─────────────────────────────────────────────────────────────────────
describe('A5: o placar da importação soma as linhas [3]', () => {
  it('"com aviso" é das que entraram, não uma situação a mais', async () => {
    const { placarDaImportacao } = await import('@/lib/importacao/o-que-entra')
    const t = placarDaImportacao({ novas: 8, completadas: 0, semMudanca: 1, comAviso: 1, recusadas: 1, oportunidades: 0 })
    expect(t).toBe('8 novos · 0 completados · 1 sem mudança · 1 recusada · das 9 que entraram, 1 com aviso')
  })
  it('sem aviso e sem sem-mudança, como antes; a oportunidade antes do aviso', async () => {
    const { placarDaImportacao } = await import('@/lib/importacao/o-que-entra')
    expect(placarDaImportacao({ novas: 4, completadas: 1, semMudanca: 0, comAviso: 0, recusadas: 0, oportunidades: 2 }))
      .toBe('4 novos · 1 completado · 0 recusadas · 2 oportunidades')
    expect(placarDaImportacao({ novas: 4, completadas: 0, semMudanca: 0, comAviso: 2, recusadas: 1, oportunidades: 1 }))
      .toBe('4 novos · 0 completados · 1 recusada · 1 oportunidade · das 4 que entraram, 2 com aviso')
  })
  it('a tela usa (o resultado e o histórico)', () => {
    const f = ler('components/branch/importador-de-contatos.tsx')
    expect(f).toContain('placarDaImportacao(')
    expect(f).not.toMatch(/const placar = /)
  })
})

// ─── A40 ────────────────────────────────────────────────────────────────────
describe('A40: com mais de um funil, o campo da importação se chama "Funil e etapa" [3]', () => {
  it('o rótulo', async () => {
    const { rotuloDaEtapaDaImportacao } = await import('@/lib/importacao/o-que-entra')
    expect(rotuloDaEtapaDaImportacao(1)).toBe('Etapa')
    expect(rotuloDaEtapaDaImportacao(2)).toBe('Funil e etapa')
  })
  it('a tela usa', () => {
    expect(ler('components/branch/importador-de-contatos.tsx')).toContain('rotuloDaEtapaDaImportacao(p.funis.length)')
  })
})

// ─── A6 ─────────────────────────────────────────────────────────────────────
describe('A6: o funil criado diz que as etapas são as iniciais [3]', () => {
  it('o texto', async () => {
    const { AVISO_DO_FUNIL_NOVO, NEW_FUNNEL_STAGES } = await import('@/lib/crm')
    for (const e of NEW_FUNNEL_STAGES) expect(AVISO_DO_FUNIL_NOVO).toContain(e.name)
    expect(AVISO_DO_FUNIL_NOVO).toMatch(/renomeie|remova/i)
  })
  it('a janela mostra no funil recém-criado', () => {
    const f = ler('components/branch/crm-stage-settings.tsx')
    expect(f).toContain('AVISO_DO_FUNIL_NOVO')
    expect(f).toContain('data-funil-novo')
  })
})

// ─── A9 ─────────────────────────────────────────────────────────────────────
describe('A9: o aviso do bairro do CEP aponta o campo que existe [3]', () => {
  it('o bairro entrou no logradouro (não há campo de bairro)', async () => {
    const { avisoDoBairroDoCep } = await import('@/lib/cep')
    expect(avisoDoBairroDoCep('Centro')).toBe('O bairro “Centro” veio da busca do CEP e entrou no logradouro: confira.')
  })
})

// ─── A34 ────────────────────────────────────────────────────────────────────
describe('A34: o último funil escolhido fica [7]', () => {
  const funis = [
    { id: 'vendas', is_default: true },
    { id: 'corporal', is_default: false },
    { id: 'facial', is_default: false },
  ]
  const total: Record<string, number> = { vendas: 0, corporal: 4, facial: 0 }
  const lerFunil = async (id: string) => ({ id, total: total[id] ?? 0 })
  it('o lembrado vence o padrão e o primeiro com oportunidade, mesmo vazio', async () => {
    const { funilDoDashboard } = await import('@/lib/crm/funil-do-dashboard')
    expect((await funilDoDashboard({ funis, pedido: null, lembrado: 'facial', lerFunil, total: e => e.total })).funil?.id).toBe('facial')
  })
  it('o pedido no endereço vence o lembrado; o lembrado que não existe (arquivado) é ignorado', async () => {
    const { funilDoDashboard } = await import('@/lib/crm/funil-do-dashboard')
    expect((await funilDoDashboard({ funis, pedido: 'vendas', lembrado: 'facial', lerFunil, total: e => e.total })).funil?.id).toBe('vendas')
    expect((await funilDoDashboard({ funis, pedido: null, lembrado: 'arquivado', lerFunil, total: e => e.total })).funil?.id).toBe('corporal')
  })
  it('o seletor anota a escolha; o quadro (nos dois portais) e o relatório leem', () => {
    // A42 da 24ª: o cookie se monta em lib/crm/funil-lembrado (cookieDoFunilLembrado, com o COOKIE_DO_FUNIL).
    expect(ler('components/shared/funnel-select.tsx')).toContain('cookieDoFunilLembrado(')
    for (const f of ['app/admin/oportunidades/page.tsx', 'app/[slug]/oportunidades/page.tsx', 'components/admin/reports-bi-section.tsx']) {
      expect(ler(f), f).toContain('funilLembrado(')
    }
  })
})

// ─── A28 e A29: o painel comercial ──────────────────────────────────────────
const getLeadFunnel = vi.fn()
const getPainelComercial = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) }) }))
vi.mock('@/lib/db', () => ({ ler: async (q: unknown) => ((await q) as { data: unknown }).data }))
vi.mock('@/lib/crm/funis', () => ({
  seedDefaultFunnel: async () => [
    { id: 'vendas', name: 'Funil de vendas', is_default: true, archived_at: null },
    { id: 'corporal', name: 'Corporal', is_default: false, archived_at: null },
  ],
}))
vi.mock('@/lib/metrics/queries', () => ({
  getLeadFunnel: (...a: unknown[]) => getLeadFunnel(...a),
  getPainelComercial: (...a: unknown[]) => getPainelComercial(...a),
  getMotivosDePerda: async () => [],
  getConversaoPorOrigem: async () => [],
}))

const PAINEL = { totalLeads: 8, ganhos: 0, temGanho: true, conversaoPct: 0, agendados: 1, considerados: 0, realizados: 0, porDono: [] }
const etapa = (leads: number) => [{ name: 'Novo', leads, outcome: 'OPEN' }]

describe('A28: o relatório comercial abre no funil que tem oportunidade [3]', () => {
  beforeEach(() => {
    getLeadFunnel.mockReset(); getPainelComercial.mockReset()
    getPainelComercial.mockResolvedValue(PAINEL)
    getLeadFunnel.mockImplementation(async ({ funnelId }: { funnelId: string }) => etapa(funnelId === 'corporal' ? 8 : 0))
  })
  const args = { tenantId: 't1', branchIds: ['b1'], from: new Date('2026-11-01T03:00:00Z'), to: new Date('2026-12-01T02:59:59Z') }

  it('o padrão vazio cede ao Corporal, com as 8', async () => {
    const { painelComercial } = await import('@/lib/metrics/painel-comercial')
    const p = await painelComercial(args)
    expect(p.funilAtivo).toBe('corporal')
    expect(p.etapas).toEqual([{ name: 'Novo', count: 8 }])
  })
  it('o pedido no endereço e o lembrado valem', async () => {
    const { painelComercial } = await import('@/lib/metrics/painel-comercial')
    expect((await painelComercial({ ...args, rawFunil: 'vendas' })).funilAtivo).toBe('vendas')
    expect((await painelComercial({ ...args, funilLembrado: 'vendas' })).funilAtivo).toBe('vendas')
  })
  it('o quadro de Oportunidades, nos dois portais, abre pela mesma regra', () => {
    for (const f of ['app/admin/oportunidades/page.tsx', 'app/[slug]/oportunidades/page.tsx']) {
      expect(ler(f), f).toContain('funilDoDashboard(')
    }
  })
})

describe('A29: o comparecimento só conta o que já devia ter acontecido [4]', () => {
  beforeEach(() => {
    getLeadFunnel.mockReset(); getPainelComercial.mockReset()
    getLeadFunnel.mockResolvedValue(etapa(1))
  })
  const args = { tenantId: 't1', branchIds: ['b1'], from: new Date('2026-11-01T03:00:00Z'), to: new Date('2026-12-01T02:59:59Z') }

  it('sem nenhum que já devia ter acontecido (só o de amanhã): "—", não 0%', async () => {
    getPainelComercial.mockResolvedValue({ ...PAINEL, agendados: 1, considerados: 0, realizados: 0 })
    const { painelComercial } = await import('@/lib/metrics/painel-comercial')
    expect((await painelComercial(args)).comparecimento).toBeNull()
  })
  it('com algum, a conta de sempre', async () => {
    getPainelComercial.mockResolvedValue({ ...PAINEL, agendados: 3, considerados: 2, realizados: 1 })
    const { painelComercial } = await import('@/lib/metrics/painel-comercial')
    expect((await painelComercial(args)).comparecimento).toBe(50)
  })
  it('o banco conta como considerado só o que já passou da hora (aconteceu_em <= now())', () => {
    const dir = join(WEB, '..', '..', 'supabase', 'migrations')
    const nova = readdirSync(dir).filter(f => f.startsWith('202611230')).map(f => readFileSync(join(dir, f), 'utf8'))
      .find(s => s.includes('function public.metrics_comercial'))
    expect(nova, 'a migration da 23ª que refaz metrics_comercial').toBeTruthy()
    expect(nova).toMatch(/'considerados',\s*\(select count\(\*\) from a where status <> 'CANCELLED' and aconteceu_em <= now\(\)\)/)
    expect(nova).toContain("notify pgrst, 'reload schema'")
  })
})
