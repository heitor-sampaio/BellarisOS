import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/** Expira o cache da rede na clínica (`rede:<id>`), como o sistema faz depois de mudar o plano. */
async function expirarRede(tenantId: string) {
  const r = await fetch(`${process.env.E2E_BASE_URL}/api/interno/expirar`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.INTERNO_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tags: [`rede:${tenantId}`] }),
  })
  expect(r.status).toBe(200)
}

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
/**
 * Um plano [e2e] de BASE para os retratos gravados direto no banco: sem plano
 * não há retrato (o gatilho trg_retrato_sem_plano o zera). Retrato NULL com
 * plano = tudo liberado.
 */
let planoBase: string | null = null

test.beforeAll(async () => {
  test.setTimeout(300_000)
  admin = await criarAtendente(`prad${marca}`, { papel: 'ADMIN' })
  suporte = await criarAtendente(`prsu${marca}`, { papel: 'SUPORTE' })
  outra = await criarOutraRede(`pr${marca}`)
  const { data: base, error: eBase } = await db().from('platform_plans').insert({ nome: `[e2e] Plano base ${marca}`, valor_centavos: 0 }).select('id').single<{ id: string }>()
  if (eBase) throw new Error(`criar o plano base: ${eBase.message}`)
  planoBase = base!.id
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

    // Trocar só o VALOR (o mesmo plano) não traz a versão nova de carona.
    await comSessao(browser, admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/sistema.ts', 'definirAssinatura', `${SIS()}/redes/${outra.tenantId}`,
        [outra.tenantId, { planoId, valorCentavos: 19900 }])
      expect(r.texto).toContain('"ok":true')
    })
    const soValor = await db().from('tenant_subscriptions').select('recursos, valor_centavos').eq('tenant_id', outra.tenantId)
      .single<{ recursos: { funcionalidades: string[] }; valor_centavos: number }>()
    expect(soValor.data!.valor_centavos).toBe(19900)
    expect(soValor.data!.recursos.funcionalidades).not.toContain('pacotes')

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
      // O proxy do sistema recusa o SUPORTE antes da action (volta ao login).
      const r = await chamarAcao(p, 'actions/sistema.ts', 'aplicarPlanoAtual', `${SIS()}/redes/${outra.tenantId}`, [outra.tenantId]).catch(e => ({ texto: String(e) }))
      expect(r.texto).not.toContain('"ok":true')
    })
    expect((await recursosDaRede()).recursos!.funcionalidades).toEqual(['agenda'])

    // Tirar o plano da rede leva o retrato junto: sem plano = tudo liberado.
    await comSessao(browser, admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/sistema.ts', 'definirAssinatura', `${SIS()}/redes/${outra.tenantId}`,
        [outra.tenantId, { planoId: null, valorCentavos: 0 }])
      expect(r.texto).toContain('"ok":true')
    })
    expect((await recursosDaRede()).recursos).toBeNull()
  })
})

/**
 * Fase 2 — o corte nas permissões da clínica: a funcionalidade que é um
 * MÓDULO inteiro (estoque, automações…) sai da rede quando o plano não a tem
 * — inclusive para o DONO (NETWORK_ADMIN, que tem tudo). Sem plano, tudo.
 */
test.describe.serial('o plano corta módulos inteiros na clínica — inclusive para o dono', () => {
  let dono: MembroDeTeste | null = null
  const SEM_ACESSO = 'Você não tem acesso a esta área'
  const retrato = (funcionalidades: string[]) => db().from('tenant_subscriptions')
    .upsert({ tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 0, recursos: { funcionalidades, limites: { unidades: null, membros: null, whatsapp: null } } }, { onConflict: 'tenant_id' })
  const semEstoqueNemAutomacoes = () => FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'estoque' && c !== 'automacoes')

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    // A rede [e2e] já configurada: senão o dono cai no /setup em vez do portal.
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
    dono = await criarMembro(`prdono${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [] })
  })
  test.afterAll(async () => { if (dono) await dono.limpar() })

  test('fora do plano: some do menu, a tela e a action recusam; dentro, abre', async ({ browser }) => {
    expect((await retrato(semEstoqueNemAutomacoes())).error).toBeNull()
    await expirarRede(outra.tenantId)
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/dashboard')
      const menu = p.getByRole('complementary').getByRole('navigation')
      await expect(menu.getByRole('button', { name: 'Agenda', exact: true })).toBeVisible()
      await expect(menu.getByRole('button', { name: 'Estoque', exact: true })).toHaveCount(0)
      await expect(menu.getByRole('button', { name: 'Automações', exact: true })).toHaveCount(0)

      await p.goto('/admin/estoque')
      if (new URL(p.url()).pathname === '/admin/estoque') await expect(p.getByText(SEM_ACESSO)).toBeVisible()

      const r = await chamarAcao(p, 'actions/stock.ts', 'adminUpdateMinStock', '/admin/estoque',
        ['00000000-0000-4000-8000-000000000000', outra.branchId, 9])
      // Recusada: o digest de semAcesso(), ou o "Forbidden" de quem embrulha o erro.
      expect(r.texto).toMatch(/BELLARIS_SEM_ACESSO|Forbidden/)
    })
  })

  test('sem plano (sem retrato), o dono volta a ter tudo', async ({ browser }) => {
    expect((await db().from('tenant_subscriptions').update({ recursos: null }).eq('tenant_id', outra.tenantId)).error).toBeNull()
    // O retrato vem do cache da rede (60 s); quem muda pelo sistema expira na
    // hora — aqui, pelo banco, expira-se pela rota interna, como o sistema faz.
    await expirarRede(outra.tenantId)
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/estoque')
      await expect(p).toHaveURL(/\/admin\/estoque/)
      await expect(p.getByText(SEM_ACESSO)).toHaveCount(0)
      const r = await chamarAcao(p, 'actions/stock.ts', 'adminUpdateMinStock', '/admin/estoque',
        ['00000000-0000-4000-8000-000000000000', outra.branchId, 9])
      // Passou da trava: chega à conferência do produto (que não existe).
      expect(r.texto).not.toMatch(/BELLARIS_SEM_ACESSO|Forbidden/)
      expect(r.texto).toContain('Produto ou filial não encontrado')
    })
  })
})

/**
 * Fase 3 — o que é PARTE de um módulo (pacotes dentro de procedimentos, a
 * inbox e as oportunidades dentro do CRM…): com o plano sem a funcionalidade,
 * o item sai do menu, a tela e a action recusam — para o dono também. Com o
 * plano completo, passam da trava. O portal do cliente, à parte.
 */
const SUBFUNCIONALIDADES: {
  chave: string; menu?: string; tela?: string
  acao: { arquivo: string; funcao: string; rota: string; args: (o: OutraRede) => unknown[] }
}[] = [
  { chave: 'pacotes', menu: 'Pacotes', tela: '/admin/pacotes',
    acao: { arquivo: 'actions/pacotes.ts', funcao: 'salvarPacote', rota: '/admin/pacotes', args: () => [{}] } },
  { chave: 'pre_pago',
    acao: { arquivo: 'actions/pre-pago.ts', funcao: 'venderProcedimento', rota: '/admin/inbox',
      args: o => [ZERO, ZERO, o.branchId, 1, null, {}] } },
  { chave: 'planos_de_tratamento', menu: 'Tratamentos', tela: '/admin/planejamentos',
    acao: { arquivo: 'actions/treatment-plans.ts', funcao: 'criarPlanoDoCliente', rota: '/admin/planejamentos', args: o => [null, o.branchId] } },
  { chave: 'inbox', menu: 'Inbox', tela: '/admin/inbox',
    acao: { arquivo: 'actions/inbox.ts', funcao: 'getMessages', rota: '/admin/inbox', args: () => [ZERO] } },
  { chave: 'oportunidades', menu: 'Oportunidades', tela: '/admin/oportunidades',
    acao: { arquivo: 'actions/crm-funnels.ts', funcao: 'setDefaultFunnel', rota: '/admin/oportunidades', args: () => [ZERO, 'admin'] } },
  { chave: 'templates', menu: 'Templates', tela: '/admin/templates',
    acao: { arquivo: 'actions/message-templates.ts', funcao: 'saveTemplate', rota: '/admin/templates', args: () => [{}] } },
  { chave: 'campanhas', menu: 'Notificações', tela: '/admin/notificacoes',
    acao: { arquivo: 'actions/notification-campaigns.ts', funcao: 'createCampaign', rota: '/admin/notificacoes/nova', args: () => [{}] } },
  { chave: 'anuncios', tela: '/admin/marketing',
    acao: { arquivo: 'actions/integrations.ts', funcao: 'saveAdsConfig', rota: '/admin/settings', args: () => ['meta_ads', {}, false] } },
  { chave: 'comissoes', tela: '/admin/financeiro/comissoes',
    acao: { arquivo: 'actions/comissoes.ts', funcao: 'salvarConfigDeComissao', rota: '/admin/settings', args: () => [{}] } },
]
const ZERO = '00000000-0000-4000-8000-000000000000'
const RECUSADA = /BELLARIS_SEM_ACESSO|Forbidden/

test.describe.serial('o plano corta o que é parte de um módulo — inclusive para o dono', () => {
  let dono: MembroDeTeste | null = null
  let cliente: ClienteDeTeste | null = null
  const SEM_ACESSO = 'Você não tem acesso a esta área'
  const semAsSub = () => FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'portal' && !SUBFUNCIONALIDADES.some(s => s.chave === c))

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
    dono = await criarMembro(`prsub${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [] })
    cliente = await clienteComSessao(`prc${marca}`, { id: outra.branchId, slug: `e2e-un-pr${marca}` }, { tenant: outra.tenantId })
  })
  test.afterAll(async () => {
    if (cliente) await cliente.limpar()
    if (dono) await dono.limpar()
  })

  for (const comPlano of [false, true]) {
    test(comPlano ? 'com o plano completo, tudo passa da trava' : 'sem as funcionalidades no plano: menu, tela e action recusam', async ({ browser }) => {
      const recursos = comPlano ? null : { funcionalidades: semAsSub(), limites: { unidades: null, membros: null, whatsapp: null } }
      expect((await db().from('tenant_subscriptions').upsert({ tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 0, recursos }, { onConflict: 'tenant_id' })).error).toBeNull()
      await expirarRede(outra.tenantId)
      await comSessao(browser, dono!.estado, async p => {
        await p.goto('/admin/dashboard')
        const menu = p.getByRole('complementary').getByRole('navigation')
        for (const s of SUBFUNCIONALIDADES.filter(x => x.menu)) {
          await expect(menu.getByRole('button', { name: s.menu!, exact: true }), `menu: ${s.chave}`).toHaveCount(comPlano ? 1 : 0)
        }
        for (const s of SUBFUNCIONALIDADES.filter(x => x.tela)) {
          await p.goto(s.tela!)
          const barrada = new URL(p.url()).pathname !== s.tela || await p.getByText(SEM_ACESSO).isVisible()
          expect(barrada, `tela: ${s.chave}`).toBe(!comPlano)
        }
        for (const s of SUBFUNCIONALIDADES) {
          const r = await chamarAcao(p, s.acao.arquivo, s.acao.funcao, s.acao.rota, s.acao.args(outra))
          if (comPlano) expect(r.texto, `action: ${s.chave}`).not.toMatch(RECUSADA)
          else expect(r.texto, `action: ${s.chave}`).toMatch(RECUSADA)
        }
      })
    })
  }

  test('o portal do cliente: fora do plano, o paciente não usa; dentro, usa', async ({ browser }) => {
    const funcionalidades = FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'portal')
    expect((await db().from('tenant_subscriptions').upsert({ tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 0,
      recursos: { funcionalidades, limites: { unidades: null, membros: null, whatsapp: null } } }, { onConflict: 'tenant_id' })).error).toBeNull()
    await expirarRede(outra.tenantId)
    await comSessao(browser, cliente!.estado, async p => {
      await p.goto(`/e2e-un-pr${marca}/cliente`)
      await expect(p).toHaveURL(/\/conta-suspensa/, { timeout: 15_000 })
      await expect(p.getByRole('heading', { name: 'Portal indisponível' })).toBeVisible()
    })
    expect((await db().from('tenant_subscriptions').update({ recursos: null }).eq('tenant_id', outra.tenantId)).error).toBeNull()
    await expirarRede(outra.tenantId)
    await comSessao(browser, cliente!.estado, async p => {
      await p.goto(`/e2e-un-pr${marca}/cliente`)
      await expect(p).toHaveURL(new RegExp(`/e2e-un-pr${marca}/cliente`))
    })
  })
})

/**
 * Fase 3, no BANCO: os gatilhos que fazem fidelidade e documentos sozinhos
 * (o ponto no pagamento, o termo no agendamento) respeitam o plano —
 * `private.rede_tem_recurso`. Sem plano, seguem como sempre.
 */
test.describe.serial('o plano também vale nos gatilhos do banco (fidelidade e documentos)', () => {
  const definir = async (funcionalidades: string[] | null) => {
    const recursos = funcionalidades ? { funcionalidades, limites: { unidades: null, membros: null, whatsapp: null } } : null
    expect((await db().from('tenant_subscriptions').upsert({ tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 0, recursos }, { onConflict: 'tenant_id' })).error).toBeNull()
  }
  const todasMenos = (c: string) => FUNCIONALIDADES.map(f => f.chave).filter(x => x !== c)

  test('fidelidade: fora do plano, pagar não gera ponto; sem plano, gera', async () => {
    expect((await db().from('loyalty_configs').upsert({ tenant_id: outra.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 }, { onConflict: 'tenant_id' })).error).toBeNull()
    const pagar = async (clientId: string) => {
      const { error } = await db().from('financial_transactions').insert({
        branch_id: outra.branchId, client_id: clientId, type: 'INCOME', category: 'Atendimento',
        description: `[e2e] pagamento ${marca}`, amount: 100, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
      })
      expect(error).toBeNull()
    }
    const ganhos = async (clientId: string) => {
      const { data: conta } = await db().from('loyalty_accounts').select('id').eq('client_id', clientId).maybeSingle()
      if (!conta) return 0
      return ((await db().from('loyalty_transactions').select('id').eq('loyalty_account_id', conta.id).eq('kind', 'GANHO')).data ?? []).length
    }
    await definir(todasMenos('fidelidade'))
    const a = await outra.criarCliente('Plano sem fidelidade')
    await pagar(a)
    expect(await ganhos(a)).toBe(0)
    await definir(null)
    const b = await outra.criarCliente('Sem plano')
    await pagar(b)
    expect(await ganhos(b)).toBe(1)
  })

  test('documentos: fora do plano, agendar não emite o termo; sem plano, emite', async () => {
    const { data: modelo, error } = await db().rpc('documento_modelo_salvar', {
      p_tenant: outra.tenantId, p_modelo: null, p_nome: `[e2e] Termo plano ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
      p_momento: 'AGENDAMENTO', p_exigencia: 'AVISA', p_texto: 'Termo de teste.', p_arquivo_path: null, p_arquivo_sha256: null,
      p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null, p_variaveis: [], p_usa_pagamento: false, p_ator: null,
    })
    expect(error).toBeNull()
    expect((await db().from('procedures').update({ consent_template_id: (modelo as { id: string }).id }).eq('id', outra.procedureId)).error).toBeNull()
    const agendar = async (clientId: string) => {
      const { data, error: e } = await db().from('appointments').insert({
        branch_id: outra.branchId, client_id: clientId, procedure_id: outra.procedureId, professional_id: outra.professionalId,
        scheduled_at: new Date(Date.now() + 3_600_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
      }).select('id').single<{ id: string }>()
      expect(e).toBeNull()
      return data!.id
    }
    const emitidos = async (agendamento: string) => ((await db().from('issued_documents').select('id').eq('appointment_id', agendamento)).data ?? []).length
    await definir(todasMenos('documentos'))
    const x = await agendar(await outra.criarCliente('Doc sem plano'))
    expect(await emitidos(x)).toBe(0)
    await definir(null)
    const y = await agendar(await outra.criarCliente('Doc com tudo'))
    expect(await emitidos(y)).toBe(1)
  })
})

test('sem plano, sem retrato: o plano que some da rede leva o retrato junto (sem plano = tudo liberado)', async () => {
  const recursos = { funcionalidades: ['agenda'], limites: { unidades: 1, membros: 1, whatsapp: 1 } }
  const { data: plano, error: eP } = await db().from('platform_plans').insert({ nome: `[e2e] Plano some ${marca}`, valor_centavos: 0, recursos })
    .select('id').single<{ id: string }>()
  expect(eP).toBeNull()
  expect((await db().from('tenant_subscriptions').upsert({ tenant_id: outra.tenantId, plan_id: plano!.id, valor_centavos: 0, recursos }, { onConflict: 'tenant_id' })).error).toBeNull()
  // O plano é apagado (só por SQL; a tela desativa) — a FK põe plan_id nulo.
  expect((await db().from('platform_plans').delete().eq('id', plano!.id)).error).toBeNull()
  expect((await recursosDaRede()).recursos).toBeNull()
})

/**
 * Fase 4 — os LIMITES (unidades, membros, números de WhatsApp): criar ou
 * reativar o que passaria do limite é recusado — inclusive para o dono; o que
 * já existe acima dele não é apagado. Sem limite (ou sem plano), passa.
 */
test.describe.serial('os limites do plano — unidades, membros e números de WhatsApp', () => {
  let dono: MembroDeTeste | null = null
  let inativo: MembroDeTeste | null = null
  let segundaUnidade: string | null = null
  const LIMITE = /BELLARIS_LIMITE_DO_PLANO|O plano da sua rede permite até/
  const comLimites = async (limites: { unidades: number | null; membros: number | null; whatsapp: number | null } | null) => {
    const recursos = limites ? { funcionalidades: FUNCIONALIDADES.map(f => f.chave), limites } : null
    expect((await db().from('tenant_subscriptions').upsert({ tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 0, recursos }, { onConflict: 'tenant_id' })).error).toBeNull()
    await expirarRede(outra.tenantId)
  }
  const ativos = async (tabela: 'branches' | 'users' | 'whatsapp_numbers') =>
    ((await db().from(tabela).select('id').eq('tenant_id', outra.tenantId).eq('is_active', true)).data ?? []).length

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
    dono = await criarMembro(`prlim${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [] })
    inativo = await criarMembro(`prina${marca}`, { tenant: outra.tenantId, rotulo: 'Inativo', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
    expect((await db().from('users').update({ is_active: false }).eq('id', inativo.userId)).error).toBeNull()
    const { data: b, error } = await db().from('branches').insert({ tenant_id: outra.tenantId, name: `[e2e] Unidade 2 ${marca}`, slug: `e2e-un2-${marca}`, is_active: false })
      .select('id').single<{ id: string }>()
    expect(error).toBeNull()
    segundaUnidade = b!.id
  })
  test.afterAll(async () => {
    await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
    if (segundaUnidade) await db().from('branches').delete().eq('id', segundaUnidade)
    if (inativo) await inativo.limpar()
    if (dono) await dono.limpar()
  })

  test('no limite: reativar unidade, reativar membro e ligar número novo são recusados', async ({ browser }) => {
    expect((await db().from('whatsapp_numbers').insert({ tenant_id: outra.tenantId, provider: 'uazapi', label: `[e2e] Número ${marca}`, is_active: true, config: {} })).error).toBeNull()
    await comLimites({ unidades: await ativos('branches'), membros: await ativos('users'), whatsapp: await ativos('whatsapp_numbers') })
    await comSessao(browser, dono!.estado, async p => {
      const u = await chamarAcao(p, 'actions/branches.ts', 'toggleBranchStatus', '/admin/settings', [segundaUnidade, true])
      expect(u.texto, 'unidade').toMatch(LIMITE)
      const m = await chamarAcao(p, 'actions/team.ts', 'reactivateTeamMember', '/admin/team', [inativo!.userId, '/admin/team'])
      expect(m.texto, 'membro').toMatch(LIMITE)
      const w = await chamarAcao(p, 'actions/integrations.ts', 'salvarNumeroWhatsApp', '/admin/settings', [null, 'uazapi', {}, true, { rotulo: `[e2e] Segundo ${marca}` }])
      expect(w.texto, 'número').toMatch(LIMITE)
    })
    expect((await db().from('branches').select('is_active').eq('id', segundaUnidade!).single<{ is_active: boolean }>()).data!.is_active).toBe(false)
    expect((await db().from('users').select('is_active').eq('id', inativo!.userId).single<{ is_active: boolean }>()).data!.is_active).toBe(false)
    expect(await ativos('whatsapp_numbers')).toBe(1)
  })

  test('sem limite, as três passam', async ({ browser }) => {
    await comLimites(null)
    await comSessao(browser, dono!.estado, async p => {
      const u = await chamarAcao(p, 'actions/branches.ts', 'toggleBranchStatus', '/admin/settings', [segundaUnidade, true])
      expect(u.texto).not.toMatch(LIMITE)
      const m = await chamarAcao(p, 'actions/team.ts', 'reactivateTeamMember', '/admin/team', [inativo!.userId, '/admin/team'])
      expect(m.texto).not.toMatch(LIMITE)
      const w = await chamarAcao(p, 'actions/integrations.ts', 'salvarNumeroWhatsApp', '/admin/settings', [null, 'uazapi', {}, true, { rotulo: `[e2e] Segundo ${marca}` }])
      expect(w.texto).not.toMatch(LIMITE)
    })
    expect((await db().from('branches').select('is_active').eq('id', segundaUnidade!).single<{ is_active: boolean }>()).data!.is_active).toBe(true)
    expect((await db().from('users').select('is_active').eq('id', inativo!.userId).single<{ is_active: boolean }>()).data!.is_active).toBe(true)
    expect(await ativos('whatsapp_numbers')).toBe(2)
  })
})

/**
 * Fase 5 — a clínica vê o que o plano dela inclui (Configurações →
 * Assinatura): cada funcionalidade, dentro ou fora, e o uso de cada limite.
 */
test.describe.serial('a aba Assinatura mostra o que o plano inclui', () => {
  let dono: MembroDeTeste | null = null
  test.beforeAll(async () => {
    test.setTimeout(180_000)
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
    dono = await criarMembro(`prass${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [] })
  })
  test.afterAll(async () => { if (dono) await dono.limpar() })

  test('com plano: as funcionalidades dentro e fora, e o uso dos limites', async ({ browser }) => {
    const funcionalidades = FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'pacotes')
    expect((await db().from('tenant_subscriptions').upsert({ tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 0,
      recursos: { funcionalidades, limites: { unidades: 3, membros: null, whatsapp: 2 } } }, { onConflict: 'tenant_id' })).error).toBeNull()
    await expirarRede(outra.tenantId)
    const unidades = ((await db().from('branches').select('id').eq('tenant_id', outra.tenantId).eq('is_active', true)).data ?? []).length
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/settings?tab=assinatura')
      const card = p.locator('section', { hasText: 'O que o seu plano inclui' })
      await expect(card).toBeVisible()
      await expect(card.getByRole('listitem').filter({ hasText: 'Agenda' }).first()).toContainText('Incluído')
      await expect(card.getByRole('listitem').filter({ hasText: 'Pacotes' })).toContainText('Fora do plano')
      await expect(card.getByText(`Unidades: ${unidades} de 3`)).toBeVisible()
      await expect(card.getByText(/Membros da equipe: \d+ · ilimitado/)).toBeVisible()
    })
  })

  test('sem plano: tudo liberado', async ({ browser }) => {
    expect((await db().from('tenant_subscriptions').update({ recursos: null }).eq('tenant_id', outra.tenantId)).error).toBeNull()
    await expirarRede(outra.tenantId)
    await comSessao(browser, dono!.estado, async p => {
      await p.goto('/admin/settings?tab=assinatura')
      await expect(p.locator('section', { hasText: 'O que o seu plano inclui' })).toContainText('Todas as funcionalidades, sem limite')
    })
  })
})

/**
 * O que a verificação independente achou nas fases 3–5 (2026-10-06):
 * editar a unidade no limite; o LIMITE garantido no banco (a linha que nasce
 * inativa e é ligada depois, a corrida); documentos fora do plano não travam
 * o atendimento nem o plano de tratamento; a funcionalidade separada da outra
 * que divide o mesmo módulo (inbox × oportunidades, campanhas × templates).
 */
test.describe.serial('correções da verificação das fases 3–5', () => {
  let dono: MembroDeTeste | null = null
  const ZERO_ = '00000000-0000-4000-8000-000000000000'
  const RECUSADA_ = /BELLARIS_SEM_ACESSO|Forbidden/
  type Limites = { unidades: number | null; membros: number | null; whatsapp: number | null }
  const com = async (funcionalidades: string[] | null, limites: Limites = { unidades: null, membros: null, whatsapp: null }) => {
    const recursos = funcionalidades ? { funcionalidades, limites } : null
    expect((await db().from('tenant_subscriptions').upsert({ tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 0, recursos }, { onConflict: 'tenant_id' })).error).toBeNull()
    await expirarRede(outra.tenantId)
  }
  const todas = () => FUNCIONALIDADES.map(f => f.chave)
  const ativos = async (tabela: 'branches' | 'whatsapp_numbers') =>
    ((await db().from(tabela).select('id').eq('tenant_id', outra.tenantId).eq('is_active', true)).data ?? []).length

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
    dono = await criarMembro(`prver${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [] })
  })
  test.afterAll(async () => {
    await db().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
    await db().from('branches').delete().eq('tenant_id', outra.tenantId).neq('id', outra.branchId)
    if (dono) await dono.limpar()
  })

  test('no limite de unidades, EDITAR a unidade passa (a trava é de criar e reativar)', async ({ browser }) => {
    await com(todas(), { unidades: await ativos('branches'), membros: null, whatsapp: null })
    await comSessao(browser, dono!.estado, async p => {
      await p.goto(`/admin/branches/${outra.branchId}`)
      await p.locator('#be-name').fill(`[e2e] Unidade editada ${marca}`)
      await p.getByRole('button', { name: 'Salvar alterações' }).click()
      await expect(p.getByText('Dados salvos com sucesso.')).toBeVisible({ timeout: 15_000 })
    })
  })

  test('o banco segura o limite: ligar uma linha inativa e inserir ativa além dele são recusados', async () => {
    const { error: e1 } = await db().from('whatsapp_numbers').insert({ tenant_id: outra.tenantId, provider: 'uazapi', label: `[e2e] Ativo ${marca}`, is_active: true, config: {} })
    expect(e1).toBeNull()
    const { data: pend, error: e2 } = await db().from('whatsapp_numbers').insert({ tenant_id: outra.tenantId, provider: 'uazapi', label: `[e2e] Pendente ${marca}`, is_active: false, config: {} })
      .select('id').single<{ id: string }>()
    expect(e2).toBeNull()
    await com(todas(), { unidades: await ativos('branches'), membros: null, whatsapp: await ativos('whatsapp_numbers') })
    // A uazapi e o cadastro incorporado nascem a linha inativa e a ligam depois.
    const ligar = await db().from('whatsapp_numbers').update({ is_active: true }).eq('id', pend!.id)
    expect(ligar.error?.message ?? '').toMatch(/permite até/)
    const unidade = await db().from('branches').insert({ tenant_id: outra.tenantId, name: `[e2e] Além ${marca}`, slug: `e2e-alem-${marca}`, is_active: true })
    expect(unidade.error?.message ?? '').toMatch(/permite até/)
    // Sem limite, passa.
    await com(todas())
    expect((await db().from('whatsapp_numbers').update({ is_active: true }).eq('id', pend!.id)).error).toBeNull()
  })

  test('documentos fora do plano: o pendente não trava o atendimento, e o plano de tratamento não recebe contrato', async () => {
    const { data: modelo, error } = await db().rpc('documento_modelo_salvar', {
      p_tenant: outra.tenantId, p_modelo: null, p_nome: `[e2e] Termo bloqueia ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
      p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: 'Termo.', p_arquivo_path: null, p_arquivo_sha256: null,
      p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null, p_variaveis: [], p_usa_pagamento: false, p_ator: null,
    })
    expect(error).toBeNull()
    expect((await db().from('procedures').update({ consent_template_id: (modelo as { id: string }).id }).eq('id', outra.procedureId)).error).toBeNull()
    await com(null)
    const cliente = await outra.criarCliente('Doc bloqueia')
    const { data: ag } = await db().from('appointments').insert({
      branch_id: outra.branchId, client_id: cliente, procedure_id: outra.procedureId, professional_id: outra.professionalId,
      scheduled_at: new Date(Date.now() + 7_200_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
    }).select('id').single<{ id: string }>()
    const pendentes = async () => ((await db().rpc('documentos_pendentes_do_atendimento', { p_agendamento: ag!.id })).data as unknown[] ?? []).length
    expect(await pendentes()).toBe(1)
    await com(todas().filter(c => c !== 'documentos'))
    expect(await pendentes(), 'fora do plano, o pendente não conta').toBe(0)

    // O contrato de plano padrão (o que toda rede nova ganha) não é emitido.
    expect((await db().rpc('documentos_modelos_padrao', { p_tenant: outra.tenantId })).error).toBeNull()
    const { planId } = await outra.criarPlanoProposto('Plano doc', { semTermo: true })
    const { data: emitidos, error: eE } = await db().rpc('documentos_emitir_do_plano', { p_plano: planId })
    expect(eE).toBeNull()
    expect(emitidos).toBe(0)
    await com(null)
    expect(await pendentes()).toBe(1)
  })

  test('plano de tratamento fora: gerar pela sessão de atendimento é recusado', async ({ browser }) => {
    await com(todas().filter(c => c !== 'planos_de_tratamento'))
    await comSessao(browser, dono!.estado, async p => {
      const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'generateEvaluationPlan', `/admin/agenda/${ZERO_}`, [ZERO_, '', {}, [], '', ''])
      expect(r.texto).toMatch(RECUSADA_)
    })
  })

  test('funcionalidades que dividem o módulo: uma fora, a outra dentro — cada uma pela sua trava', async ({ browser }) => {
    type Chamada = [string, string, string, unknown[]]
    const opor: Chamada = ['actions/crm-funnels.ts', 'setDefaultFunnel', '/admin/oportunidades', [ZERO_, 'admin']]
    const inbox: Chamada = ['actions/inbox.ts', 'getMessages', '/admin/inbox', [ZERO_]]
    const camp: Chamada = ['actions/notification-campaigns.ts', 'createCampaign', '/admin/notificacoes/nova', [{}]]
    const tmpl: Chamada = ['actions/message-templates.ts', 'saveTemplate', '/admin/templates', [{}]]
    const casos: { fora: string; recusa: Chamada; passa: Chamada }[] = [
      { fora: 'oportunidades', recusa: opor, passa: inbox },
      { fora: 'inbox', recusa: inbox, passa: opor },
      { fora: 'campanhas', recusa: camp, passa: tmpl },
      { fora: 'templates', recusa: tmpl, passa: camp },
    ]
    for (const c of casos) {
      await com(todas().filter(x => x !== c.fora))
      await comSessao(browser, dono!.estado, async p => {
        const r = await chamarAcao(p, c.recusa[0], c.recusa[1], c.recusa[2], c.recusa[3])
        expect(r.texto, `${c.fora} fora: ${c.recusa[1]} recusa`).toMatch(RECUSADA_)
        const ok = await chamarAcao(p, c.passa[0], c.passa[1], c.passa[2], c.passa[3])
        expect(ok.texto, `${c.fora} fora: ${c.passa[1]} passa`).not.toMatch(RECUSADA_)
      })
    }
  })
})
