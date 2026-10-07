import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'
import { totalComCondicoes, type Condicoes } from '@estetica-os/nucleo/lib/planos/condicoes'

/**
 * CORTESIA e DESCONTO na assinatura da rede (2026-10-07, decisões do Heitor):
 * por item (o plano, as conexões de WhatsApp, o Copilot), em percentual ou em
 * reais, ou de graça, com data de fim opcional. A rede toda de cortesia fica
 * ativa, sem cobrança, e as regras de atraso não a movem. A clínica vê.
 *
 * Numa rede [e2e] própria. Só contra o build (a plataforma roda em apps próprios).
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = Date.now().toString(36)
const db = () => banco()
const SEM_COPILOT = FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'copilot')
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

let admin: AtendenteDeTeste
let outra: OutraRede
let planoBase: string | null = null

test.beforeAll(async () => {
  test.setTimeout(240_000)
  admin = await criarAtendente(`cdad${marca}`, { papel: 'ADMIN' })
  outra = await criarOutraRede(`cd${marca}`)
  const recursos = {
    funcionalidades: SEM_COPILOT, limites: { unidades: null, membros: null, whatsapp: 1 },
    adicionais: { whatsapp: { valor_centavos: 4900 }, copilot: { valor_centavos: 9900 } },
  }
  const { data, error } = await db().from('platform_plans').insert({ nome: `[e2e] Plano condições ${marca}`, valor_centavos: 19900, recursos })
    .select('id').single<{ id: string }>()
  if (error) throw new Error(error.message)
  planoBase = data!.id
})

test.afterAll(async () => {
  if (outra) {
    for (const t of ['platform_audit_log', 'tenant_subscriptions'] as const) await db().from(t).delete().eq('tenant_id', outra.tenantId)
    await outra.limpar()
  }
  await db().from('platform_plans').delete().like('nome', `[e2e]%${marca}%`)
  if (admin) await admin.limpar()
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** A rede com o plano-base (R$ 199), 2 conexões e o Copilot contratados, sem condição. */
async function redeComTudo(o: { cobranca?: 'ativa' | 'sem_cobranca'; status?: string } = {}) {
  const { data: p } = await db().from('platform_plans').select('recursos').eq('id', planoBase!).single<{ recursos: unknown }>()
  const { error } = await db().from('tenant_subscriptions').upsert({
    tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 19900, recursos: p!.recursos,
    adicionais: { whatsapp: { quantidade: 2, valor_centavos: 4900 }, copilot: { quantidade: 1, valor_centavos: 9900 } },
    condicoes: {}, cobranca: o.cobranca ?? 'sem_cobranca', valor_no_asaas_centavos: null,
  }, { onConflict: 'tenant_id' })
  expect(error).toBeNull()
  expect((await db().from('tenants').update({ plan_status: o.status ?? 'trial', em_atraso_desde: null }).eq('id', outra.tenantId)).error).toBeNull()
}
const condicao = (item: string, c: unknown) =>
  db().rpc('assinatura_condicao_definir', { p_tenant: outra.tenantId, p_item: item, p_condicao: c })
const assinatura = async () => (await db().from('tenant_subscriptions')
  .select('condicoes, adicionais, valor_total_centavos').eq('tenant_id', outra.tenantId)
  .single<{ condicoes: Record<string, unknown>; adicionais: Record<string, unknown>; valor_total_centavos: number }>()).data!
const situacao = async () => (await db().from('tenants').select('plan_status').eq('id', outra.tenantId).single<{ plan_status: string }>()).data!.plan_status

test.describe.serial('o banco: cortesia e desconto por item', () => {
  test('o total do banco é a mesma conta do app, caso a caso', async () => {
    const casos: Condicoes[] = [
      {},
      { plano: { tipo: 'percentual', percentual: 20 } },
      { plano: { tipo: 'percentual', percentual: 33 }, whatsapp: { tipo: 'valor', centavos: 1000 } },
      { whatsapp: { tipo: 'cortesia' }, copilot: { tipo: 'percentual', percentual: 50 } },
      { plano: { tipo: 'valor', centavos: 50000 } }, // desconto maior que o preço: zera, não fica negativo
      // 90% do Copilot: R$ 9,90 — acima do mínimo do Asaas (99% daria R$ 0,99, recusado).
      { plano: { tipo: 'cortesia' }, whatsapp: { tipo: 'cortesia' }, copilot: { tipo: 'percentual', percentual: 90 } },
    ]
    const adicionais = { whatsapp: { quantidade: 2, valor_centavos: 4900 }, copilot: { quantidade: 1, valor_centavos: 9900 } }
    for (const c of casos) {
      await redeComTudo()
      for (const [item, valor] of Object.entries(c)) expect((await condicao(item, valor)).error, JSON.stringify(c)).toBeNull()
      expect((await assinatura()).valor_total_centavos, JSON.stringify(c)).toBe(totalComCondicoes(19900, adicionais, c))
    }
  })

  test('null tira a condição; tirar o adicional leva a condição dele; sem plano, nenhuma', async () => {
    await redeComTudo()
    expect((await condicao('whatsapp', { tipo: 'cortesia' })).error).toBeNull()
    expect((await condicao('plano', { tipo: 'percentual', percentual: 10 })).error).toBeNull()
    expect((await condicao('plano', null)).error).toBeNull()
    expect((await assinatura()).condicoes).toEqual({ whatsapp: { tipo: 'cortesia' } })
    expect((await db().rpc('assinatura_adicional_definir', { p_tenant: outra.tenantId, p_chave: 'whatsapp', p_quantidade: 0, p_valor_centavos: null })).error).toBeNull()
    expect((await assinatura()).condicoes).toEqual({})
    expect((await condicao('plano', { tipo: 'cortesia' })).error).toBeNull()
    await db().from('tenant_subscriptions').update({ plan_id: null }).eq('tenant_id', outra.tenantId)
    expect((await assinatura()).condicoes).toEqual({})
  })

  test('recusa o que não fecha: item que a rede não tem, condição inválida, fim no passado, sem plano', async () => {
    await redeComTudo()
    expect((await db().rpc('assinatura_adicional_definir', { p_tenant: outra.tenantId, p_chave: 'copilot', p_quantidade: 0, p_valor_centavos: null })).error).toBeNull()
    expect((await condicao('copilot', { tipo: 'cortesia' })).error?.message ?? '').toMatch(/não tem/i)
    expect((await condicao('sms', { tipo: 'cortesia' })).error?.message ?? '').toMatch(/desconhecido/i)
    expect((await condicao('plano', { tipo: 'percentual', percentual: 150 })).error?.message ?? '').toMatch(/1% a 100%/)
    expect((await condicao('plano', { tipo: 'valor', centavos: 0 })).error?.message ?? '').toMatch(/inválido/i)
    expect((await condicao('plano', { tipo: 'brinde' })).error?.message ?? '').toMatch(/inválida/i)
    expect((await condicao('plano', { tipo: 'cortesia', ate: '2020-01-01' })).error?.message ?? '').toMatch(/já passou/i)
    await db().from('tenant_subscriptions').update({ plan_id: null }).eq('tenant_id', outra.tenantId)
    expect((await condicao('plano', { tipo: 'cortesia' })).error?.message ?? '').toMatch(/sem plano/i)
  })

  test('item com condição é condição especial: a clínica cancela, não aumenta', async () => {
    await redeComTudo()
    expect((await condicao('whatsapp', { tipo: 'percentual', percentual: 50 })).error).toBeNull()
    const clinica = (q: number) => db().rpc('assinatura_adicional_definir', { p_tenant: outra.tenantId, p_chave: 'whatsapp', p_quantidade: q, p_valor_centavos: null })
    expect((await clinica(3)).error?.message ?? '').toMatch(/condição especial/i)
    expect((await clinica(1)).error, 'diminuir pode').toBeNull()
  })

  test('a rede toda de cortesia vai a ativa, e a regra de atraso não a move', async () => {
    await redeComTudo({ status: 'trial' })
    expect((await condicao('plano', { tipo: 'cortesia' })).error).toBeNull()
    expect((await condicao('whatsapp', { tipo: 'cortesia' })).error).toBeNull()
    const { data, error } = await condicao('copilot', { tipo: 'cortesia' })
    expect(error).toBeNull()
    expect((data as { cortesia_total: boolean }).cortesia_total).toBe(true)
    expect((await assinatura()).valor_total_centavos).toBe(0)
    expect(await situacao()).toBe('active')
    // Mesmo se alguém a puser em teste vencido, a regra não a joga em atraso.
    await db().from('tenants').update({ plan_status: 'trial', trial_ends_at: '2020-01-01T00:00:00Z' }).eq('id', outra.tenantId)
    expect((await db().rpc('assinaturas_aplicar_regras', { p_tenant: outra.tenantId })).error).toBeNull()
    expect(await situacao()).toBe('trial')
  })

  test('no dia seguinte ao fim, a condição sai e o item volta ao preço normal', async () => {
    await redeComTudo()
    expect((await condicao('plano', { tipo: 'percentual', percentual: 50, ate: hojeSP() })).error).toBeNull()
    // O fim é hoje: ainda vale.
    expect((await db().rpc('assinaturas_encerrar_condicoes_vencidas', { p_tenant: outra.tenantId })).data ?? []).toEqual([])
    // Gravada direto com o fim ontem: vence.
    await db().from('tenant_subscriptions').update({ condicoes: { plano: { tipo: 'percentual', percentual: 50, ate: '2020-01-01' }, whatsapp: { tipo: 'cortesia' } } })
      .eq('tenant_id', outra.tenantId)
    const { data, error } = await db().rpc('assinaturas_encerrar_condicoes_vencidas', { p_tenant: outra.tenantId })
    expect(error).toBeNull()
    expect(data).toEqual([{ tenant_id: outra.tenantId, itens: ['plano'] }])
    const a = await assinatura()
    expect(a.condicoes).toEqual({ whatsapp: { tipo: 'cortesia' } })
    expect(a.valor_total_centavos).toBe(19900 + 0 + 9900)
  })

  // Verificação de 2026-10-07: "rede de cortesia" é ter plano e nada a pagar,
  // venha de onde vier — e o banco ajusta a rede, qualquer que seja o caminho.
  const cobranca = async () => (await db().from('tenant_subscriptions').select('cobranca').eq('tenant_id', outra.tenantId).single<{ cobranca: string }>()).data!.cobranca

  test('100% de desconto também é rede de cortesia: ativa, sem atraso, cobrança "cortesia"', async () => {
    await redeComTudo({ status: 'past_due' })
    expect((await condicao('whatsapp', { tipo: 'cortesia' })).error).toBeNull()
    expect((await condicao('copilot', { tipo: 'valor', centavos: 9900 })).error).toBeNull()
    expect((await condicao('plano', { tipo: 'percentual', percentual: 100 })).error).toBeNull()
    expect(await situacao()).toBe('active')
    expect(await cobranca()).toBe('cortesia')
    const { data: t } = await db().from('tenants').select('atraso_perdoado_ate, em_atraso_desde').eq('id', outra.tenantId).single<{ atraso_perdoado_ate: string | null; em_atraso_desde: string | null }>()
    expect(t).toEqual({ atraso_perdoado_ate: hojeSP(), em_atraso_desde: null })
  })

  test('cancelar o último adicional pago, com o plano de cortesia, também deixa a rede de cortesia', async () => {
    await redeComTudo({ status: 'trial' })
    expect((await condicao('plano', { tipo: 'cortesia' })).error).toBeNull()
    expect((await condicao('whatsapp', { tipo: 'cortesia' })).error).toBeNull()
    expect(await situacao(), 'o Copilot ainda é pago').toBe('trial')
    expect((await db().rpc('assinatura_adicional_definir', { p_tenant: outra.tenantId, p_chave: 'copilot', p_quantidade: 0, p_valor_centavos: null })).error).toBeNull()
    expect(await situacao()).toBe('active')
    expect(await cobranca()).toBe('cortesia')
  })

  test('trocar de plano não leva a condição do plano para o novo', async () => {
    await redeComTudo()
    expect((await condicao('plano', { tipo: 'cortesia' })).error).toBeNull()
    expect((await condicao('whatsapp', { tipo: 'percentual', percentual: 10 })).error).toBeNull()
    const { data: outro } = await db().from('platform_plans').insert({
      nome: `[e2e] Plano condições outro ${marca}`, valor_centavos: 29900,
      recursos: { funcionalidades: SEM_COPILOT, limites: { unidades: null, membros: null, whatsapp: 1 }, adicionais: {} },
    }).select('id, recursos').single<{ id: string; recursos: unknown }>()
    await db().from('tenant_subscriptions').update({ plan_id: outro!.id, recursos: outro!.recursos }).eq('tenant_id', outra.tenantId)
    expect((await assinatura()).condicoes, 'a do adicional fica; a do plano sai').toEqual({ whatsapp: { tipo: 'percentual', percentual: 10 } })
  })

  test('mensalidade abaixo do mínimo do Asaas (R$ 5,00) é recusada; zero (cortesia) pode', async () => {
    await redeComTudo()
    expect((await condicao('whatsapp', { tipo: 'cortesia' })).error).toBeNull()
    expect((await condicao('copilot', { tipo: 'cortesia' })).error).toBeNull()
    // R$ 199,00 com 99% de desconto: R$ 1,99.
    expect((await condicao('plano', { tipo: 'percentual', percentual: 99 })).error?.message ?? '').toMatch(/mínimo/i)
    expect((await condicao('plano', { tipo: 'valor', centavos: 19800 })).error?.message ?? '').toMatch(/mínimo/i)
    expect((await condicao('plano', { tipo: 'percentual', percentual: 97 })).error, 'R$ 5,97 pode').toBeNull()
  })
})

/** Expira o cache da rede na clínica (`rede:<id>`). */
async function expirarRede(tenantId: string) {
  const r = await fetch(`${process.env.E2E_BASE_URL}/api/interno/expirar`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.INTERNO_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tags: [`rede:${tenantId}`] }),
  })
  expect(r.status).toBe(200)
}
const daquiA = (dias: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))
const br = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

test.describe.serial('o sistema: dar cortesia e desconto na tela da rede', () => {
  const SIS = () => urlDaPlataforma('sistema')

  test('20% no plano até uma data, e cortesia nas conexões, pela tela', async ({ browser }) => {
    await redeComTudo()
    const fim = daquiA(30)
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/redes/${outra.tenantId}`)
      const plano = p.getByRole('group', { name: 'Condição: Plano' })
      await plano.getByRole('button', { name: 'Desconto em %' }).click()
      await plano.getByLabel('Percentual').fill('20')
      await plano.getByLabel('Até (opcional)').fill(fim)
      await plano.getByRole('button', { name: 'Salvar' }).click()
      await expect(p.getByText('Condição salva.')).toBeVisible({ timeout: 15_000 })
      await expect(plano.getByText(`20% de desconto até ${br(fim)}`)).toBeVisible({ timeout: 15_000 })

      const whats = p.getByRole('group', { name: 'Condição: Conexões de WhatsApp' })
      await whats.getByRole('button', { name: 'Cortesia' }).click()
      await whats.getByRole('button', { name: 'Salvar' }).click()
      await expect(whats.getByText('Cortesia do BellarisOS')).toBeVisible({ timeout: 15_000 })
    })
    const a = await assinatura()
    expect(a.condicoes).toEqual({ plano: { tipo: 'percentual', percentual: 20, ate: fim }, whatsapp: { tipo: 'cortesia' } })
    expect(a.valor_total_centavos).toBe(15920 + 0 + 9900)
    const { data: log } = await db().from('platform_audit_log').select('id').eq('tenant_id', outra.tenantId).eq('kind', 'assinatura.condicao')
    expect((log ?? []).length).toBeGreaterThanOrEqual(2)
  })

  test('"Preço normal" tira a condição', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/redes/${outra.tenantId}`)
      const plano = p.getByRole('group', { name: 'Condição: Plano' })
      await plano.getByRole('button', { name: 'Preço normal' }).click()
      await plano.getByRole('button', { name: 'Salvar' }).click()
      await expect(p.getByText('Condição salva.')).toBeVisible({ timeout: 15_000 })
    })
    expect((await assinatura()).condicoes).toEqual({ whatsapp: { tipo: 'cortesia' } })
  })
})

test.describe.serial('a clínica vê a cortesia e o desconto', () => {
  let dono: MembroDeTeste | null = null
  test.beforeAll(async () => {
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
    dono = await criarMembro(`cddono${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [] })
  })
  test.afterAll(async () => { if (dono) await dono.limpar() })

  test('na aba Assinatura: cada condição, o total com elas, e o adicional com condição não aumenta', async ({ browser }) => {
    await redeComTudo({ status: 'active' })
    expect((await condicao('plano', { tipo: 'percentual', percentual: 20 })).error).toBeNull()
    expect((await condicao('whatsapp', { tipo: 'cortesia' })).error).toBeNull()
    await expirarRede(outra.tenantId)
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/settings?tab=assinatura')
      const condicoes = p.getByRole('region', { name: 'Condições do BellarisOS' })
      await expect(condicoes.getByText(/Plano: 20% de desconto/)).toBeVisible({ timeout: 20_000 })
      await expect(condicoes.getByText(/Conexões de WhatsApp: Cortesia do BellarisOS/)).toBeVisible()
      await expect(p.getByText(/R\$\s258,20 por mês/)).toBeVisible()
      const adicionais = p.getByRole('region', { name: 'Adicionais' })
      await expect(adicionais.getByRole('button', { name: 'Contratar mais uma conexão' })).toHaveCount(0)
      await expect(adicionais.getByText(/condição especial/i).first()).toBeVisible()
    })
  })
})
