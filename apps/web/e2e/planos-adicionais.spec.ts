import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * ADICIONAIS do plano (2026-10-07, decisão do Heitor): conexões de WhatsApp
 * além do limite e o Copilot avulso.
 *  - o PLANO oferece cada adicional, com o preço;
 *  - a rede contrata — pelo sistema OU pela própria clínica —, com o preço
 *    retratado; a mensalidade (e o Asaas) recebe plano + adicionais;
 *  - o limite e as funcionalidades efetivas contam o contratado, no app e no
 *    banco.
 *
 * Numa rede [e2e] própria. Só contra o build (a plataforma roda em apps
 * próprios).
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = Date.now().toString(36)
const db = () => banco()
/** Expira o cache da rede na clínica (`rede:<id>`), como o sistema faz depois de mudar a assinatura. */
async function expirarRede(tenantId: string) {
  const r = await fetch(`${process.env.E2E_BASE_URL}/api/interno/expirar`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.INTERNO_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tags: [`rede:${tenantId}`] }),
  })
  expect(r.status).toBe(200)
}
const SEM_COPILOT = FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'copilot')

let admin: AtendenteDeTeste
let outra: OutraRede
let planoBase: string | null = null

test.beforeAll(async () => {
  test.setTimeout(300_000)
  admin = await criarAtendente(`adad${marca}`, { papel: 'ADMIN' })
  outra = await criarOutraRede(`ad${marca}`)
  const { data: base, error } = await db().from('platform_plans').insert({ nome: `[e2e] Plano adicionais ${marca}`, valor_centavos: 10000 })
    .select('id').single<{ id: string }>()
  if (error) throw new Error(`criar o plano base: ${error.message}`)
  planoBase = base!.id
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (outra) {
    for (const t of ['whatsapp_numbers', 'platform_audit_log', 'tenant_subscriptions'] as const) {
      const { error } = await db().from(t).delete().eq('tenant_id', outra.tenantId)
      if (error) falhas.push(`${t}: ${error.message}`)
    }
    await outra.limpar()
  }
  const { error } = await db().from('platform_plans').delete().like('nome', `[e2e]%${marca}%`)
  if (error) falhas.push(`planos: ${error.message}`)
  if (admin) await admin.limpar()
  expect(falhas).toEqual([])
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

type Oferta = Partial<Record<'whatsapp' | 'copilot', { valor_centavos: number }>>
/** A rede com o plano-base, um retrato com a oferta dada, e nada contratado. */
async function redeCom(o: { whatsapp?: number | null; funcionalidades?: string[]; oferta?: Oferta; cobranca?: 'ativa' | 'sem_cobranca'; base?: number } = {}) {
  const recursos = {
    funcionalidades: o.funcionalidades ?? SEM_COPILOT,
    limites: { unidades: null, membros: null, whatsapp: o.whatsapp === undefined ? 1 : o.whatsapp },
    adicionais: o.oferta ?? { whatsapp: { valor_centavos: 4900 }, copilot: { valor_centavos: 9900 } },
  }
  // A oferta vale pelo plano do CATÁLOGO; o retrato guarda funcionalidades e limites.
  expect((await db().from('platform_plans').update({ recursos }).eq('id', planoBase!)).error).toBeNull()
  const { error } = await db().from('tenant_subscriptions').upsert({
    tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: o.base ?? 10000, recursos, adicionais: {},
    cobranca: o.cobranca ?? 'sem_cobranca', valor_no_asaas_centavos: o.cobranca === 'ativa' ? (o.base ?? 10000) : null,
  }, { onConflict: 'tenant_id' })
  expect(error).toBeNull()
  await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
}
const definir = (chave: string, quantidade: number, valor: number | null = null) =>
  db().rpc('assinatura_adicional_definir', { p_tenant: outra.tenantId, p_chave: chave, p_quantidade: quantidade, p_valor_centavos: valor })
const assinatura = async () => (await db().from('tenant_subscriptions')
  .select('adicionais, valor_centavos, valor_total_centavos, valor_no_asaas_centavos').eq('tenant_id', outra.tenantId)
  .single<{ adicionais: Record<string, { quantidade: number; valor_centavos: number }>; valor_centavos: number; valor_total_centavos: number; valor_no_asaas_centavos: number | null }>()).data!
const numero = (ativo: boolean, n: number) => db().from('whatsapp_numbers')
  .insert({ tenant_id: outra.tenantId, provider: 'uazapi', label: `[e2e] Número ${n} ${marca}`, is_active: ativo, config: {} })

test.describe.serial('o banco: contratar e tirar adicional', () => {
  test('contrata pelo preço do plano, e a mensalidade soma', async () => {
    await redeCom()
    const { error } = await definir('whatsapp', 2)
    expect(error).toBeNull()
    expect((await definir('copilot', 1)).error).toBeNull()
    const a = await assinatura()
    expect(a.adicionais).toEqual({ whatsapp: { quantidade: 2, valor_centavos: 4900 }, copilot: { quantidade: 1, valor_centavos: 9900 } })
    expect(a.valor_total_centavos).toBe(10000 + 2 * 4900 + 9900)
  })

  test('aumentar mantém o preço contratado, mesmo com o plano mais caro; o sistema pode dar preço especial', async () => {
    await redeCom()
    expect((await definir('whatsapp', 1)).error).toBeNull()
    const { data: r } = await db().from('platform_plans').select('recursos').eq('id', planoBase!).single<{ recursos: Record<string, unknown> }>()
    await db().from('platform_plans').update({ recursos: { ...r!.recursos, adicionais: { whatsapp: { valor_centavos: 5900 } } } }).eq('id', planoBase!)
    expect((await definir('whatsapp', 3)).error).toBeNull()
    expect((await assinatura()).adicionais.whatsapp).toEqual({ quantidade: 3, valor_centavos: 4900 })
    expect((await definir('whatsapp', 3, 3000)).error).toBeNull()
    expect((await assinatura()).adicionais.whatsapp).toEqual({ quantidade: 3, valor_centavos: 3000, especial: true })
    expect((await definir('whatsapp', 0)).error).toBeNull()
    expect((await assinatura()).adicionais).toEqual({})
  })

  test('o limite do banco conta o extra, e tirar o extra em uso é recusado', async () => {
    await redeCom({ whatsapp: 1 })
    expect((await definir('whatsapp', 1)).error).toBeNull()
    expect((await numero(true, 1)).error).toBeNull()
    expect((await numero(true, 2)).error, 'o extra libera o segundo').toBeNull()
    expect((await numero(true, 3)).error?.message ?? '').toMatch(/permite até 2/)
    const tirar = await definir('whatsapp', 0)
    expect(tirar.error?.message ?? '').toMatch(/desative/i)
    expect((await assinatura()).adicionais.whatsapp?.quantidade).toBe(1)
  })

  test('recusa o que não cabe: fora da faixa, desconhecido, não oferecido, plano que já inclui, rede sem plano', async () => {
    await redeCom({ oferta: { whatsapp: { valor_centavos: 4900 } } })
    expect((await definir('whatsapp', 11)).error?.message ?? '').toMatch(/até 10/)
    expect((await definir('copilot', 2)).error?.message ?? '').toMatch(/até 1/)
    expect((await definir('sms', 1)).error?.message ?? '').toMatch(/desconhecido/i)
    expect((await definir('copilot', 1)).error?.message ?? '', 'o plano não oferece o Copilot').toMatch(/não oferece/i)
    expect((await definir('copilot', 1, 9900)).error, 'com preço dado (o sistema), cabe').toBeNull()

    await redeCom({ whatsapp: null })
    expect((await definir('whatsapp', 1, 4900)).error?.message ?? '', 'WhatsApp ilimitado').toMatch(/ilimitado/i)
    await redeCom({ funcionalidades: [...SEM_COPILOT, 'copilot'], oferta: {} })
    expect((await definir('copilot', 1, 9900)).error?.message ?? '', 'o plano já inclui').toMatch(/já inclui/i)

    await db().from('tenant_subscriptions').update({ plan_id: null }).eq('tenant_id', outra.tenantId)
    expect((await definir('whatsapp', 1, 4900)).error?.message ?? '').toMatch(/sem plano/i)
  })

  test('tirar o plano limpa os adicionais', async () => {
    await redeCom()
    expect((await definir('whatsapp', 2)).error).toBeNull()
    await db().from('tenant_subscriptions').update({ plan_id: null }).eq('tenant_id', outra.tenantId)
    const a = await assinatura()
    expect(a.adicionais).toEqual({})
    expect(a.valor_total_centavos).toBe(a.valor_centavos)
  })

  test('com a cobrança ligada, o valor novo fica pendente de levar ao Asaas', async () => {
    await redeCom({ cobranca: 'ativa' })
    const { data, error } = await definir('whatsapp', 1)
    expect(error).toBeNull()
    expect((data as { pendente_no_asaas: boolean }).pendente_no_asaas).toBe(true)
    const a = await assinatura()
    expect(a.valor_no_asaas_centavos).toBe(10000)
    expect(a.valor_total_centavos).toBe(14900)
  })

  test('o MRR do painel do sistema conta os adicionais (é a mensalidade inteira)', async () => {
    await redeCom({ cobranca: 'ativa' })
    const { data: antes } = await db().from('tenants').select('plan_status').eq('id', outra.tenantId).single<{ plan_status: string }>()
    expect((await db().from('tenants').update({ plan_status: 'active' }).eq('id', outra.tenantId)).error).toBeNull()
    const mrr = async () => ((await db().rpc('plataforma_indicadores', { p_somente_teste: true })).data as { mrr_centavos: number }).mrr_centavos
    // Outras redes [e2e] podem mudar o MRR ao mesmo tempo (a suíte roda em
    // paralelo): a diferença exata em uma de três tentativas basta.
    const diferencas: number[] = []
    for (let i = 0; i < 3; i++) {
      expect((await definir('whatsapp', 2)).error).toBeNull()
      const com = await mrr()
      expect((await definir('whatsapp', 0)).error).toBeNull()
      diferencas.push(com - await mrr())
      if (diferencas.at(-1) === 9800) break
    }
    expect(diferencas).toContain(9800)
    await db().from('tenants').update({ plan_status: antes!.plan_status }).eq('id', outra.tenantId)
  })

  test('preço especial do sistema não se estende ao que a clínica compra (nem a cortesia)', async () => {
    await redeCom()
    // O sistema dá uma conexão de cortesia: preço 0, diferente da oferta.
    expect((await definir('whatsapp', 1, 0)).error).toBeNull()
    expect((await assinatura()).adicionais.whatsapp).toEqual({ quantidade: 1, valor_centavos: 0, especial: true })
    // A clínica (sem preço) não sobe a quantidade de uma condição especial…
    expect((await definir('whatsapp', 2)).error?.message ?? '').toMatch(/condição especial/i)
    // …mas cancela.
    expect((await definir('whatsapp', 0)).error).toBeNull()
    // Pelo preço da oferta, não é especial: a clínica sobe depois.
    expect((await definir('whatsapp', 1, 4900)).error).toBeNull()
    expect((await definir('whatsapp', 2)).error).toBeNull()
    expect((await assinatura()).adicionais.whatsapp).toEqual({ quantidade: 2, valor_centavos: 4900 })
  })

  test('a oferta é a do plano no CATÁLOGO: oferecer depois vale para quem já assina', async () => {
    await redeCom({ oferta: {} })
    expect((await definir('copilot', 1)).error?.message ?? '').toMatch(/não oferece/i)
    const { data: r } = await db().from('platform_plans').select('recursos').eq('id', planoBase!).single<{ recursos: Record<string, unknown> }>()
    await db().from('platform_plans').update({ recursos: { ...r!.recursos, adicionais: { copilot: { valor_centavos: 5500 } } } }).eq('id', planoBase!)
    expect((await definir('copilot', 1)).error).toBeNull()
    expect((await assinatura()).adicionais.copilot).toEqual({ quantidade: 1, valor_centavos: 5500 })
  })

  test('mudar o retrato tira, no mesmo comando, o adicional que ele passa a incluir', async () => {
    await redeCom()
    expect((await definir('copilot', 1)).error).toBeNull()
    expect((await definir('whatsapp', 2)).error).toBeNull()
    const { data: r } = await db().from('tenant_subscriptions').select('recursos').eq('tenant_id', outra.tenantId).single<{ recursos: { funcionalidades: string[] } }>()
    await db().from('tenant_subscriptions').update({ recursos: { ...r!.recursos, funcionalidades: [...r!.recursos.funcionalidades, 'copilot'] } }).eq('tenant_id', outra.tenantId)
    expect((await assinatura()).adicionais).toEqual({ whatsapp: { quantidade: 2, valor_centavos: 4900 } })
  })

  // Até a verificação de 2026-10-07 isto era recusado. Agora, plano e nada a
  // pagar é REDE DE CORTESIA: o banco aceita e marca a pendência — o sistema
  // pausa a cobrança no Asaas (planos-condicoes e assinaturas-asaas provam).
  test('com a cobrança ligada, tirar o único item pago vira cortesia: aceito, e o sistema pausa a cobrança', async () => {
    await redeCom({ cobranca: 'ativa', base: 0 })
    expect((await definir('whatsapp', 1)).error).toBeNull()
    const { data, error } = await definir('whatsapp', 0)
    expect(error).toBeNull()
    expect(data as { total_centavos: number; pendente_no_asaas: boolean }).toMatchObject({ total_centavos: 0, pendente_no_asaas: true })
  })
})

test.describe.serial('o sistema: a oferta no plano e os adicionais da rede', () => {
  const SIS = () => urlDaPlataforma('sistema')
  const PLANO = `[e2e] Plano com oferta ${marca}`
  let planoOferta: string | null = null

  test('o plano oferece cada adicional, com o preço, pela tela', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/planos`)
      const form = p.locator('form', { hasText: 'Novo plano' })
      await form.locator('input[name="nome"]').fill(PLANO)
      await form.locator('input[name="valor"]').fill('199,00')
      await form.getByRole('checkbox', { name: 'Copilot (IA secretária) · em breve', exact: true }).uncheck()
      await form.getByRole('checkbox', { name: 'Números de WhatsApp: ilimitado' }).uncheck()
      await form.getByRole('slider', { name: 'Números de WhatsApp' }).fill('1')
      await form.getByRole('checkbox', { name: 'Oferecer: Conexão de WhatsApp adicional' }).check()
      await form.getByLabel('Preço por mês: Conexão de WhatsApp adicional').fill('49,00')
      await form.getByRole('checkbox', { name: 'Oferecer: Copilot (IA secretária)' }).check()
      await form.getByLabel('Preço por mês: Copilot (IA secretária)').fill('99,00')
      await form.getByRole('button', { name: 'Criar plano' }).click()
      await expect(p.getByText('Plano criado.')).toBeVisible({ timeout: 15_000 })
    })
    const { data } = await db().from('platform_plans').select('id, recursos').eq('nome', PLANO)
      .single<{ id: string; recursos: { adicionais: unknown } }>()
    planoOferta = data!.id
    expect(data!.recursos.adicionais).toEqual({ whatsapp: { valor_centavos: 4900 }, copilot: { valor_centavos: 9900 } })
  })

  test('na tela da rede, o admin contrata o WhatsApp extra (pelo preço do plano) e o Copilot (preço especial)', async ({ browser }) => {
    await redeCom()  // sem cobrança e sem nada contratado
    await comSessao(browser, admin.estado, async p => {
      const rota = `${SIS()}/redes/${outra.tenantId}`
      expect((await chamarAcao(p, 'actions/sistema.ts', 'definirAssinatura', rota, [outra.tenantId, { planoId: planoOferta, valorCentavos: 19900 }])).texto)
        .toContain('"ok":true')
      await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
      await p.goto(rota)
      // A tela da rede é leitura; os adicionais se editam no modal (2026-10-07).
      await p.getByRole('button', { name: 'Editar adicionais' }).click()
      const modal = p.getByRole('dialog', { name: 'Adicionais' })
      const whats = modal.getByRole('group', { name: 'Conexão de WhatsApp adicional' })
      await whats.getByLabel('Quantidade').fill('2')
      await whats.getByRole('button', { name: 'Salvar' }).click()
      await expect(p.getByText('Adicional salvo.')).toBeVisible({ timeout: 15_000 })
      await expect(p.getByText('Total por mês: R$ 297,00')).toBeVisible({ timeout: 15_000 })

      const copilot = modal.getByRole('group', { name: 'Copilot (IA secretária)' })
      await copilot.getByLabel('Quantidade').fill('1')
      await copilot.getByLabel('Preço por mês (R$)').fill('79,00')
      await copilot.getByRole('button', { name: 'Salvar' }).click()
      await expect(p.getByText('Total por mês: R$ 376,00')).toBeVisible({ timeout: 15_000 })
    })
    const a = await assinatura()
    expect(a.adicionais).toEqual({ whatsapp: { quantidade: 2, valor_centavos: 4900 }, copilot: { quantidade: 1, valor_centavos: 7900, especial: true } })
    const { data: log } = await db().from('platform_audit_log').select('id').eq('tenant_id', outra.tenantId).eq('kind', 'assinatura.adicional')
    expect(log ?? []).toHaveLength(2)
  })

  test('trocar para um plano que já inclui o Copilot tira o Copilot avulso; o WhatsApp extra fica', async ({ browser }) => {
    const { data: comCopilot } = await db().from('platform_plans').insert({
      nome: `[e2e] Plano com Copilot ${marca}`, valor_centavos: 25000,
      recursos: { funcionalidades: [...SEM_COPILOT, 'copilot'], limites: { unidades: null, membros: null, whatsapp: 1 }, adicionais: { whatsapp: { valor_centavos: 3900 } } },
    }).select('id').single<{ id: string }>()
    await comSessao(browser, admin.estado, async p => {
      expect((await chamarAcao(p, 'actions/sistema.ts', 'definirAssinatura', `${SIS()}/redes/${outra.tenantId}`,
        [outra.tenantId, { planoId: comCopilot!.id, valorCentavos: 25000 }])).texto).toContain('"ok":true')
    })
    const a = await assinatura()
    expect(a.adicionais, 'o preço contratado do WhatsApp fica').toEqual({ whatsapp: { quantidade: 2, valor_centavos: 4900 } })
    expect(a.valor_total_centavos).toBe(25000 + 9800)
  })

  test('o SUPORTE não mexe em adicional, nem pela action', async ({ browser }) => {
    const suporte = await criarAtendente(`adsu${marca}`, { papel: 'SUPORTE' })
    try {
      await comSessao(browser, await suporte.estadoNo('sistema'), async p => {
        const r = await chamarAcao(p, 'actions/sistema.ts', 'definirAdicional', `${SIS()}/redes/${outra.tenantId}`,
          [outra.tenantId, { chave: 'whatsapp', quantidade: 5, valorCentavos: null }]).catch(e => ({ texto: String(e) }))
        expect(r.texto).not.toContain('"ok":true')
      })
      expect((await assinatura()).adicionais.whatsapp?.quantidade).toBe(2)
    } finally { await suporte.limpar() }
  })
})

test.describe.serial('a clínica: ver e contratar o adicional pela aba Assinatura', () => {
  const SIS = () => urlDaPlataforma('sistema')
  const RECUSADA = /BELLARIS_SEM_ACESSO|Forbidden/
  let dono: MembroDeTeste | null = null
  let gestorDaUnidade: MembroDeTeste | null = null
  let semConfig: MembroDeTeste | null = null

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
    dono = await criarMembro(`addono${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [] })
    gestorDaUnidade = await criarMembro(`adgest${marca}`, {
      tenant: outra.tenantId, branchId: outra.branchId, rotulo: 'Gestor da unidade', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
    })
    semConfig = await criarMembro(`adsem${marca}`, { tenant: outra.tenantId, rotulo: 'Sem configurações', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  })
  test.afterAll(async () => {
    for (const m of [dono, gestorDaUnidade, semConfig]) if (m) await m.limpar()
  })

  /** Plano de R$ 100 com WhatsApp 1 e as duas ofertas; nada contratado; o cache da clínica expirado. */
  async function comOferta() {
    await redeCom()
    await expirarRede(outra.tenantId)
  }

  test('o dono contrata uma conexão, conferindo o valor novo, e o limite cresce na hora', async ({ browser }) => {
    await comOferta()
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/settings?tab=assinatura')
      const card = p.getByRole('region', { name: 'Adicionais' })
      await expect(card.getByText('R$ 49,00 por conexão, por mês')).toBeVisible({ timeout: 20_000 })
      await card.getByRole('button', { name: 'Contratar mais uma conexão' }).click()
      const janela = p.getByRole('alertdialog', { name: 'Contratar conexão de WhatsApp' })
      await expect(janela.getByText(/A mensalidade passa de R\$\s100,00 para R\$\s149,00/)).toBeVisible()
      await janela.getByRole('button', { name: 'Confirmar contratação' }).click()
      await expect(p.getByText('Conexão de WhatsApp contratada.')).toBeVisible({ timeout: 15_000 })
      await expect(p.getByText('Números de WhatsApp: 0 de 2')).toBeVisible({ timeout: 15_000 })
    })
    expect((await assinatura()).adicionais).toEqual({ whatsapp: { quantidade: 1, valor_centavos: 4900 } })
    const { data: log } = await db().from('platform_audit_log').select('dados').eq('tenant_id', outra.tenantId).eq('kind', 'assinatura.adicional')
    expect((log ?? []).some(l => (l.dados as { origem?: string }).origem === 'clinica')).toBe(true)
  })

  test('o Copilot avulso: contratado, aparece incluído (em breve); cancelar volta', async ({ browser }) => {
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/settings?tab=assinatura')
      const card = p.getByRole('region', { name: 'Adicionais' })
      await card.getByRole('button', { name: 'Contratar o Copilot' }).click()
      await p.getByRole('alertdialog', { name: 'Contratar o Copilot' }).getByRole('button', { name: 'Confirmar contratação' }).click()
      await expect(p.getByText('Copilot contratado.')).toBeVisible({ timeout: 15_000 })
      await expect(card.getByText('Contratado · em breve')).toBeVisible({ timeout: 15_000 })

      await card.getByRole('button', { name: 'Cancelar o Copilot' }).click()
      await p.getByRole('alertdialog', { name: 'Cancelar o Copilot' }).getByRole('button', { name: 'Confirmar cancelamento' }).click()
      await expect(p.getByText('Copilot cancelado.')).toBeVisible({ timeout: 15_000 })
    })
    expect((await assinatura()).adicionais.copilot).toBeUndefined()
  })

  test('cancelar a conexão em uso é recusado, com o motivo na tela', async ({ browser }) => {
    expect((await numero(true, 1)).error).toBeNull()
    expect((await numero(true, 2)).error).toBeNull()
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/settings?tab=assinatura')
      await p.getByRole('region', { name: 'Adicionais' }).getByRole('button', { name: 'Cancelar uma conexão' }).click()
      const janela = p.getByRole('alertdialog', { name: 'Cancelar conexão de WhatsApp' })
      await janela.getByRole('button', { name: 'Confirmar cancelamento' }).click()
      await expect(janela.getByText(/Desative um número antes/)).toBeVisible({ timeout: 15_000 })
    })
    expect((await assinatura()).adicionais.whatsapp?.quantidade).toBe(1)
    await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
  })

  test('o que a clínica não pode: unidade, sem configurações, sem oferta', async ({ browser }) => {
    const contratar = async (estado: string, chave = 'whatsapp', quantidade = 2) => {
      let texto = ''
      await comSessao(browser, estado, async p => {
        texto = (await chamarAcao(p, 'actions/assinatura.ts', 'contratarAdicional', '/admin/settings?tab=assinatura', [chave, quantidade])).texto
      })
      return texto
    }
    expect(await contratar(gestorDaUnidade!.estado), 'quem tem unidade fixa não contrata pela rede').toMatch(RECUSADA)
    expect(await contratar(semConfig!.estado)).toMatch(RECUSADA)
    // Sem a oferta do Copilot no plano: a clínica não dá preço, então não contrata.
    await redeCom({ oferta: { whatsapp: { valor_centavos: 4900 } } })
    await expirarRede(outra.tenantId)
    expect(await contratar(dono!.estado, 'copilot', 1)).toMatch(/não oferece/)
    expect((await assinatura()).adicionais).toEqual({})
  })

  test('o que o sistema contrata a clínica enxerga na próxima tela', async ({ browser }) => {
    await comOferta()
    await comSessao(browser, admin.estado, async p => {
      expect((await chamarAcao(p, 'actions/sistema.ts', 'definirAdicional', `${SIS()}/redes/${outra.tenantId}`,
        [outra.tenantId, { chave: 'whatsapp', quantidade: 3, valorCentavos: null }])).texto).toContain('"ok":true')
    })
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/settings?tab=assinatura')
      await expect(p.getByText('Números de WhatsApp: 0 de 4')).toBeVisible({ timeout: 20_000 })
    })
  })
})
