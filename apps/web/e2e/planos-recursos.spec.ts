import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'

/**
 * PLANOS com funcionalidades e limites (2026-10-06, decisão do Heitor).
 *
 * Fase 1 — o catálogo e o retrato:
 *  - o plano guarda as funcionalidades (checkbox) e os limites (1 a 10, ou
 *    ilimitado), pela tela do sistema;
 *  - a rede que recebe o plano guarda um RETRATO; editar o plano depois não
 *    muda a rede, até o admin "Aplicar a versão atual do plano";
 *  - o SUPORTE não aplica.
 *
 * Numa rede [e2e] própria, com atendentes [e2e].
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')
const SIS = () => urlDaPlataforma('sistema')

const marca = Date.now().toString(36)
const db = () => banco()
const PLANO = `[e2e] Plano recursos ${marca}`

let admin: AtendenteDeTeste
let suporte: AtendenteDeTeste
let outra: OutraRede
let planoId: string | null = null

test.beforeAll(async () => {
  test.setTimeout(300_000)
  admin = await criarAtendente(`prad${marca}`, { papel: 'ADMIN' })
  suporte = await criarAtendente(`prsu${marca}`, { papel: 'SUPORTE' })
  outra = await criarOutraRede(`pr${marca}`)
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (outra) {
    for (const t of ['platform_audit_log', 'tenant_subscriptions'] as const) {
      const { error } = await db().from(t).delete().eq('tenant_id', outra.tenantId)
      if (error) falhas.push(`${t}: ${error.message}`)
    }
    await outra.limpar()
  }
  const { error } = await db().from('platform_plans').delete().like('nome', `[e2e]%${marca}%`)
  if (error) falhas.push(`planos: ${error.message}`)
  for (const a of [admin, suporte]) if (a) await a.limpar()
  expect(falhas).toEqual([])
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const recursosDaRede = async () => (await db().from('tenant_subscriptions').select('recursos, plan_id')
  .eq('tenant_id', outra.tenantId).single<{ recursos: { funcionalidades: string[]; limites: Record<string, number | null> } | null; plan_id: string }>()).data!

test.describe.serial('planos com funcionalidades e limites — o catálogo e o retrato', () => {
  test('o plano guarda as funcionalidades e os limites, pela tela', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/planos`)
      const form = p.locator('form', { hasText: 'Novo plano' })
      await form.locator('input[name="nome"]').fill(PLANO)
      await form.locator('input[name="valor"]').fill('299,00')
      // Plano novo nasce com tudo ligado; aqui, sem pacotes e sem Copilot.
      await form.getByRole('checkbox', { name: 'Pacotes', exact: true }).uncheck()
      await form.getByRole('checkbox', { name: 'Copilot (IA secretária)' }).uncheck()
      // Unidades: 3; membros: ilimitado; WhatsApp: 1.
      await form.getByRole('checkbox', { name: 'Unidades: ilimitado' }).uncheck()
      await form.getByRole('slider', { name: 'Unidades' }).fill('3')
      await form.getByRole('checkbox', { name: 'Números de WhatsApp: ilimitado' }).uncheck()
      await form.getByRole('slider', { name: 'Números de WhatsApp' }).fill('1')
      await form.getByRole('button', { name: 'Criar plano' }).click()
      await expect(p.getByText('Plano criado.')).toBeVisible({ timeout: 15_000 })
    })
    const { data } = await db().from('platform_plans').select('id, recursos').eq('nome', PLANO)
      .single<{ id: string; recursos: { funcionalidades: string[]; limites: Record<string, number | null> } }>()
    planoId = data!.id
    expect(data!.recursos.funcionalidades).toContain('agenda')
    expect(data!.recursos.funcionalidades).not.toContain('pacotes')
    expect(data!.recursos.funcionalidades).not.toContain('copilot')
    expect(data!.recursos.limites).toEqual({ unidades: 3, membros: null, whatsapp: 1 })
  })

  test('a rede que recebe o plano guarda o RETRATO; editar o plano não muda a rede, até aplicar a versão atual', async ({ browser }) => {
    await comSessao(browser, admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/sistema.ts', 'definirAssinatura', `${SIS()}/redes/${outra.tenantId}`,
        [outra.tenantId, { planoId, valorCentavos: 29900 }])
      expect(r.texto).toContain('"ok":true')
    })
    const antes = await recursosDaRede()
    expect(antes.plan_id).toBe(planoId)
    expect(antes.recursos!.funcionalidades).not.toContain('pacotes')
    expect(antes.recursos!.limites.unidades).toBe(3)

    // O catálogo muda (agora com pacotes, e 5 unidades): a rede, não.
    await comSessao(browser, admin.estado, async p => {
      const { data: atual } = await db().from('platform_plans').select('recursos').eq('id', planoId!).single<{ recursos: { funcionalidades: string[] } }>()
      const r = await chamarAcao(p, 'actions/sistema.ts', 'salvarPlano', `${SIS()}/planos`, [{
        id: planoId, nome: PLANO, valorCentavos: 29900, ativo: true,
        recursos: { funcionalidades: [...atual!.recursos.funcionalidades, 'pacotes'], limites: { unidades: 5, membros: null, whatsapp: 1 } },
      }])
      expect(r.texto).toContain('"ok":true')
    })
    expect((await recursosDaRede()).recursos!.funcionalidades).not.toContain('pacotes')

    // "Aplicar a versão atual do plano", na tela da rede.
    await comSessao(browser, admin.estado, async p => {
      await p.goto(`${SIS()}/redes/${outra.tenantId}`)
      await p.getByRole('button', { name: 'Aplicar a versão atual do plano' }).click()
      await expect(p.getByText('Plano aplicado à rede.')).toBeVisible({ timeout: 15_000 })
    })
    const depois = await recursosDaRede()
    expect(depois.recursos!.funcionalidades).toContain('pacotes')
    expect(depois.recursos!.limites.unidades).toBe(5)
    const { data: log } = await db().from('platform_audit_log').select('id').eq('tenant_id', outra.tenantId).eq('kind', 'assinatura.plano_aplicado')
    expect(log ?? []).toHaveLength(1)
  })

  test('o SUPORTE não aplica o plano, nem pela action', async ({ browser }) => {
    // Volta o retrato para o antigo e confere que o SUPORTE não o troca.
    const { error } = await db().from('tenant_subscriptions').update({ recursos: { funcionalidades: ['agenda'], limites: { unidades: 1, membros: 1, whatsapp: 1 } } })
      .eq('tenant_id', outra.tenantId)
    expect(error).toBeNull()
    await comSessao(browser, await suporte.estadoNo('sistema'), async p => {
      await chamarAcao(p, 'actions/sistema.ts', 'aplicarPlanoAtual', `${SIS()}/redes/${outra.tenantId}`, [outra.tenantId]).catch(() => null)
    })
    expect((await recursosDaRede()).recursos!.funcionalidades).toEqual(['agenda'])
  })
})
