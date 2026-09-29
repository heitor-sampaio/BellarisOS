import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Comissões, fase 1 (2026-09-30): Configurações → Comissões (como a comissão
 * acontece e as taxas da maquininha) e a comissão de cada membro na Equipe
 * (padrão + exceções por procedimento).
 *
 * Numa rede [e2e] própria: a configuração é da REDE, e mexer na real mudaria a
 * comissão de gente de verdade. As recusas são pela action direta (a tela
 * esconder não prova nada) e pelo PostgREST com o token do membro — até esta
 * fase, qualquer funcionário gravava `commission_rules` pela sessão.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`com${marca}`)
  // O profissional da rede atende: sem comissão, a tela tem de avisar.
  const { error } = await db().from('users').update({ provides_services: true, is_active: true }).eq('id', rede.professionalId)
  expect(error).toBeNull()
  gestor = await criarMembro(`comg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor comissões',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'team', nivel: 'VIEW' }],
  })
  // Gere a equipe e VÊ o financeiro: não mexe em quanto cada um ganha.
  soVe = await criarMembro(`comv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê comissões',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'team', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (soVe) await soVe.limpar()
  if (gestor) await gestor.limpar()
  if (rede) await rede.limpar()
})

async function comSessao<T>(browser: Browser, membro: MembroDeTeste, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ storageState: membro.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const regras = async () => (await db().from('commission_rules').select('procedure_id, type, value')
  .eq('professional_id', rede!.professionalId).order('procedure_id', { nullsFirst: true })).data ?? []

test.describe.serial('comissões — configuração e regras', () => {
  test('Configurações → Comissões grava como a comissão acontece e as taxas', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      // O profissional atende e não tem comissão: o aviso o nomeia.
      await expect(p.locator('[data-sem-regra]')).toContainText(`Prof com${marca}`)

      const como = p.locator('[aria-label="Como a comissão acontece"]')
      await como.getByRole('button', { name: 'Quando o cliente paga' }).click()
      await como.getByLabel('Custo dos insumos usados no atendimento').check()
      await como.getByLabel('Taxa da maquininha do pagamento (tabela abaixo)').check()
      await como.getByRole('button', { name: 'Quinzenal' }).click()
      await como.getByRole('button', { name: 'Salvar' }).click()
      await expect(como.getByRole('status')).toHaveText('Salvo.')

      const taxas = p.locator('[aria-label="Taxas da maquininha"]')
      await taxas.getByLabel('Taxa Pix').fill('0,99')
      await taxas.getByLabel('Taxa Crédito à vista').fill('3,2')
      await taxas.getByLabel('Taxa 6x').fill('8')
      await taxas.getByRole('button', { name: 'Salvar taxas' }).click()
      await expect(taxas.getByRole('status')).toHaveText('Salvo.')
    })

    const { data: cfg } = await db().from('commission_configs')
      .select('modo, desconta_insumos, desconta_taxa, periodo, updated_by').eq('tenant_id', rede!.tenantId).single()
    expect(cfg).toEqual({ modo: 'PAGAMENTO', desconta_insumos: true, desconta_taxa: true, periodo: 'QUINZENAL', updated_by: gestor!.userId })
    const { data: fees } = await db().from('payment_fees').select('metodo, parcelas, taxa_pct')
      .eq('tenant_id', rede!.tenantId).order('metodo').order('parcelas')
    expect((fees ?? []).map(f => [f.metodo, f.parcelas, Number(f.taxa_pct)])).toEqual([
      ['CREDIT_CARD', 1, 3.2], ['CREDIT_CARD', 6, 8], ['PIX', 1, 0.99],
    ])
  })

  test('a Equipe define a comissão padrão e a exceção de um procedimento', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      await p.goto('/admin/team')
      const chip = p.locator(`[data-comissao="${rede!.professionalId}"]`)
      await expect(chip).toHaveText('Sem comissão')
      await chip.click()

      // O nome do profissional é o que criarOutraRede monta.
      const dialogo = p.getByRole('dialog', { name: `Comissão de ${PREFIXO} Prof com${marca}` })
      await expect(dialogo).toBeVisible()
      await dialogo.getByRole('button', { name: 'Percentual', exact: true }).click()
      await dialogo.getByLabel('Valor da comissão padrão').fill('30')
      await dialogo.getByLabel('Adicionar exceção').selectOption(rede!.procedureId)
      const excecao = dialogo.locator(`[data-excecao="${rede!.procedureId}"]`)
      await excecao.getByLabel('Tipo da exceção').selectOption('FIXED_AMOUNT')
      await excecao.getByRole('textbox').fill('80')
      await dialogo.getByRole('button', { name: 'Salvar' }).click()

      await expect(chip).toHaveText('Comissão 30% · 1 exceção')
    })
    const lidas = await regras()
    expect(lidas.map(r => [r.procedure_id, r.type, Number(r.value)])).toEqual([
      [null, 'PERCENTAGE', 30], [rede!.procedureId, 'FIXED_AMOUNT', 80],
    ])

    // Com padrão, o aviso de "sem comissão" some.
    await comSessao(browser, gestor!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      await expect(p.locator('[aria-label="Comissão de cada profissional"]')).toContainText('Todos os profissionais que atendem têm comissão configurada.')
    })
  })

  test('percentual acima de 100 é recusado (tela e action)', async ({ browser }) => {
    await comSessao(browser, gestor!, async p => {
      const r = await chamarAcao(p, 'actions/comissoes.ts', 'salvarRegrasDoProfissional', '/admin/team',
        [rede!.professionalId, { padrao: { tipo: 'PERCENTAGE', valor: 150 }, excecoes: [] }])
      expect(r.texto).toContain('Percentual acima de 100%')
    })
    expect((await regras()).map(r => Number(r.value))).toEqual([30, 80])
  })

  test('quem só VÊ o financeiro não vê o chip nem grava pela action', async ({ browser }) => {
    await comSessao(browser, soVe!, async p => {
      await p.goto('/admin/team')
      await expect(p.getByText(`Prof com${marca}`).first()).toBeVisible()
      await expect(p.locator('[data-comissao]')).toHaveCount(0)

      const regrasR = await chamarAcao(p, 'actions/comissoes.ts', 'salvarRegrasDoProfissional', '/admin/team',
        [rede!.professionalId, { padrao: { tipo: 'PERCENTAGE', valor: 99 }, excecoes: [] }])
      expect(regrasR.texto).not.toContain('"ok":true')
      const cfgR = await chamarAcao(p, 'actions/comissoes.ts', 'salvarConfigDeComissao', '/admin/settings',
        [{ modo: 'ATENDIMENTO', desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL' }])
      expect(cfgR.texto).not.toContain('"ok":true')
      const taxasR = await chamarAcao(p, 'actions/comissoes.ts', 'salvarTaxasDaMaquininha', '/admin/settings', [[]])
      expect(taxasR.texto).not.toContain('"ok":true')
    })
    expect((await regras()).map(r => Number(r.value))).toEqual([30, 80])
    const { data: cfg } = await db().from('commission_configs').select('modo').eq('tenant_id', rede!.tenantId).single()
    expect(cfg?.modo).toBe('PAGAMENTO')
    const { count } = await db().from('payment_fees').select('metodo', { count: 'exact', head: true }).eq('tenant_id', rede!.tenantId)
    expect(count).toBe(3)
  })

  test('um profissional de outra rede não recebe regra', async ({ browser }) => {
    const outra = await criarOutraRede(`como${marca}`)
    try {
      await comSessao(browser, gestor!, async p => {
        const r = await chamarAcao(p, 'actions/comissoes.ts', 'salvarRegrasDoProfissional', '/admin/team',
          [outra.professionalId, { padrao: { tipo: 'PERCENTAGE', valor: 10 }, excecoes: [] }])
        expect(r.texto).toContain('Profissional não encontrado')
        // A exceção com procedimento de outra rede também é recusada (pela função).
        const r2 = await chamarAcao(p, 'actions/comissoes.ts', 'salvarRegrasDoProfissional', '/admin/team',
          [rede!.professionalId, { padrao: null, excecoes: [{ procedure_id: outra.procedureId, tipo: 'PERCENTAGE', valor: 10 }] }])
        expect(r2.texto).not.toContain('"ok":true')
      })
      const { count } = await db().from('commission_rules').select('id', { count: 'exact', head: true }).eq('professional_id', outra.professionalId)
      expect(count).toBe(0)
      expect((await regras()).map(r => Number(r.value))).toEqual([30, 80])
    } finally {
      await outra.limpar()
    }
  })

  test('a sessão não grava regra, configuração nem taxa pelo PostgREST', async () => {
    const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${gestor!.accessToken}` } },
    })
    // Controle: a sessão LÊ as regras da própria rede.
    const { data: lidas, error: eLer } = await api.from('commission_rules').select('id').eq('professional_id', rede!.professionalId)
    expect(eLer).toBeNull()
    expect(lidas).toHaveLength(2)

    const ins = await api.from('commission_rules').insert({
      tenant_id: rede!.tenantId, professional_id: gestor!.userId, procedure_id: null, type: 'PERCENTAGE', value: 90, is_active: true,
    }).select('id')
    expect(ins.error).not.toBeNull()
    const upd = await api.from('commission_rules').update({ value: 99 }).eq('professional_id', rede!.professionalId).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    const cfg = await api.from('commission_configs').update({ modo: 'ATENDIMENTO' }).eq('tenant_id', rede!.tenantId).select('tenant_id')
    expect(cfg.data ?? []).toHaveLength(0)
    const fee = await api.from('payment_fees').insert({ tenant_id: rede!.tenantId, metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 50 }).select('metodo')
    expect(fee.error).not.toBeNull()
    const rpc = await api.rpc('comissao_regras_definir', {
      p_tenant: rede!.tenantId, p_profissional: rede!.professionalId, p_padrao: null, p_excecoes: [], p_ator: null,
    })
    expect(rpc.error).not.toBeNull()

    expect((await regras()).map(r => Number(r.value))).toEqual([30, 80])
  })
})
