import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * A configuração da rede toda é só da Admin da rede (o Heitor, 18/11, na
 * auditoria das regras: "só pela conta admin"). Antes (H7 da 5ª simulação,
 * 2026-11-01: "gerente de uma unidade só mexe no que é da unidade") bastava
 * ter "A rede inteira".
 *
 * A gerente de unidade fixa da Zona Sul abria "Tags e importações" e o resto de
 * Configurações e gravava o que vale para a rede inteira (A6). Agora a trava é
 * o CARGO de sistema Admin da rede gravado (`ctx.isNetworkAdmin`), nunca a
 * claim: com os módulos em Gerenciar, nem quem tem unidade fixa nem quem tem
 * "A rede inteira" sem ser a Admin grava configuração da rede, pela tela nem
 * pela action direta. A gerente continua mexendo no que é da unidade dela (os
 * dados, o horário e as salas). A dona (Admin da rede) é o controle.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gerente: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let daRede: MembroDeTeste | null = null
let slug = ''
test.describe.configure({ timeout: 180_000 })

const TUDO_EM_GERENCIAR: Permissao[] = (['clients', 'crm', 'settings', 'roles', 'forms', 'documents', 'automations', 'marketing', 'procedures', 'financial', 'agenda'] as const)
  .map(modulo => ({ modulo, nivel: 'MANAGE' as const }))

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const nome = (o: string, quem: string) => `${PREFIXO} ${o} ${quem} ${marca}`
const conta = async (tabela: string, coluna: string, valor: string) => {
  const { data, error } = await db().from(tabela).select('id').eq('tenant_id', rede!.tenantId).eq(coluna, valor)
  expect(error, `ler ${tabela}`).toBeNull()
  return (data ?? []).length
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`pgu${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  gerente = await criarMembro(`pgug${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente', permissoes: TUDO_EM_GERENCIAR })
  dona = await criarMembro(`pgud${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  // "A rede inteira" (sem unidade) e tudo em Gerenciar, mas sem o cargo de Admin da rede.
  daRede = await criarMembro(`pgur${marca}`, { tenant: rede.tenantId, branchId: null, rotulo: 'Sócia', permissoes: TUDO_EM_GERENCIAR })
})

test.afterAll(async () => {
  if (rede) {
    const t = rede.tenantId
    await db().from('automations').delete().eq('tenant_id', t)
    await db().from('notification_campaigns').delete().eq('tenant_id', t)
    await db().from('forms').delete().eq('tenant_id', t).like('name', `${PREFIXO}%`)
    await db().from('tags').delete().eq('tenant_id', t)
    await db().from('crm_motivos_perda').delete().eq('tenant_id', t)
    await db().from('integration_configs').delete().eq('tenant_id', t)
  }
  await gerente?.limpar(); await dona?.limpar(); await daRede?.limpar(); await rede?.limpar()
})

type Quem = 'gerente' | 'dona' | 'daRede'

/** Uma gravação de configuração da REDE, chamada direto pela action. */
interface Caso {
  nome: string
  /** A chamada como a pessoa, com o nome que ela grava. */
  chamar: (p: Page, quem: Quem) => Promise<unknown>
  /** Quantos registros com o nome de quem gravou (ou o valor que a action mudaria). */
  gravou: (quem: Quem) => Promise<unknown>
  /** O que `gravou` devolve quando NADA foi gravado. */
  nada: unknown
  semControle?: string
}

const CASOS: Caso[] = [
  { nome: 'tags (Configurações → Tags)', nada: 0,
    chamar: (p, q) => chamarAcao(p, 'actions/tags.ts', 'criarTag', `/${slug}/settings?tab=tags`, [nome('Tag', q)]),
    gravou: q => conta('tags', 'nome', nome('Tag', q)) },
  { nome: 'motivos de perda (Configurar funis)', nada: 0,
    chamar: (p, q) => chamarAcao(p, 'actions/crm-motivos.ts', 'criarMotivoDePerda', `/${slug}/oportunidades`, [nome('Motivo', q)]),
    gravou: q => conta('crm_motivos_perda', 'nome', nome('Motivo', q)) },
  { nome: 'funis (Configurar funis)', nada: 0,
    chamar: (p, q) => chamarAcaoComFormulario(p, 'actions/crm-funnels.ts', 'createFunnel', `/${slug}/oportunidades`, [undefined], { name: nome('Funil', q), _slug: slug }),
    gravou: q => conta('crm_funnels', 'name', nome('Funil', q)) },
  { nome: 'cargos (Configurações → Cargos)', nada: 0,
    chamar: (p, q) => chamarAcaoComFormulario(p, 'actions/roles.ts', 'createRole', `/${slug}/settings?tab=permissions`, [undefined], { label: nome('Cargo', q) }),
    gravou: q => conta('tenant_roles', 'label', nome('Cargo', q)) },
  { nome: 'fichas (Configurações → Fichas)', nada: 0,
    chamar: (p, q) => chamarAcao(p, 'actions/fichas.ts', 'criarFicha', `/${slug}/settings?tab=fichas`, [{ name: nome('Ficha', q), schema: { fields: [{ id: 'q', type: 'text', label: 'Pergunta' }] } }]),
    gravou: q => conta('forms', 'name', nome('Ficha', q)) },
  { nome: 'termos e contratos (Configurações → Documentos)', nada: 0,
    chamar: (p, q) => chamarAcao(p, 'actions/modelos-de-documento.ts', 'salvarModeloDoEditor', `/${slug}/settings?tab=documentos`, [{
      nome: nome('Modelo', q), tipo: 'TERMO', momento: 'AGENDAMENTO', exigencia: 'AVISA',
      documento: { corpo: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Termo de ' }, { type: 'variavel', attrs: { nome: 'cliente.nome' } }] }] } },
    }]),
    gravou: q => conta('document_templates', 'name', nome('Modelo', q)) },
  { nome: 'dados da rede (Configurações → Geral)', nada: 0,
    chamar: (p, q) => chamarAcaoComFormulario(p, 'actions/rede.ts', 'atualizarDadosDaRede', `/${slug}/settings?tab=general`, [undefined], {
      name: nome('Rede', q), email: `e2e-outra-pgu${marca}@bellaris.invalid`, portal_prazo_alteracao_horas: '24', plano_validade_dias: '30',
    }),
    gravou: async q => (await db().from('tenants').select('name').eq('id', rede!.tenantId).single<{ name: string }>()).data?.name === nome('Rede', q) ? 1 : 0 },
  // "Quem vê o inbox no 'só os meus'" saiu com o refino (SM3, o Heitor, 2026-11-23).
  { nome: 'integrações (Configurações → Integrações)', nada: 0,
    chamar: (p, q) => chamarAcao(p, 'actions/integrations.ts', 'saveAdsConfig', `/${slug}/settings?tab=integrations`, ['meta_ads', { adAccountId: `act_${q}` }, false]),
    gravou: async q => {
      const { data } = await db().from('integration_configs').select('config').eq('tenant_id', rede!.tenantId).eq('provider', 'meta_ads').maybeSingle<{ config: { adAccountId?: string } }>()
      return data?.config?.adAccountId === `act_${q}` ? 1 : 0
    } },
  { nome: 'automações', nada: 0,
    chamar: (p, q) => chamarAcao(p, 'actions/automacoes.ts', 'criarAutomacao', '/admin/automacoes', [nome('Automação', q)]),
    gravou: q => conta('automations', 'nome', nome('Automação', q)) },
  { nome: 'campanhas', nada: 0,
    chamar: (p, q) => chamarAcao(p, 'actions/notification-campaigns.ts', 'createCampaign', '/admin/notificacoes/nova', [{
      name: nome('Campanha', q), type: 'IMMEDIATE', title: 'x', body: 'x', notification_type: 'promo', audience_rules: {},
    }]),
    gravou: q => conta('notification_campaigns', 'name', nome('Campanha', q)) },
]

test('quem não é a Admin da rede (uma unidade ou "A rede inteira"), com tudo em Gerenciar, não grava configuração da rede pela action direta; a Admin da rede grava', async ({ browser }) => {
  // O controle primeiro: a dona grava cada uma (e a página fica compilada).
  await como(browser, dona!, async p => {
    for (const c of CASOS) {
      await c.chamar(p, 'dona')
      if (!c.semControle) expect.soft(await c.gravou('dona'), `controle: a dona grava — ${c.nome}`).not.toEqual(c.nada)
    }
  })
  await como(browser, gerente!, async p => {
    for (const c of CASOS) {
      await c.chamar(p, 'gerente')
      expect.soft(await c.gravou('gerente'), `a gerente não grava — ${c.nome}`).toEqual(c.nada)
    }
  })
  await como(browser, daRede!, async p => {
    for (const c of CASOS) {
      await c.chamar(p, 'daRede')
      expect.soft(await c.gravou('daRede'), `quem tem "A rede inteira" sem ser a Admin não grava — ${c.nome}`).toEqual(c.nada)
    }
  })
})

test('quem tem só uma unidade continua mexendo na unidade dela: os dados, o horário e as salas', async ({ browser }) => {
  const sala = `${PREFIXO} Sala da gerente ${marca}`
  const telefone = '(48) 3333-4444'
  await como(browser, gerente!, async p => {
    await p.goto(`/${slug}/settings?tab=unidade`)
    // A aba da unidade, no portal da unidade: o formulário e as salas dela.
    await expect(p.getByRole('heading', { name: 'Salas' })).toBeVisible()
    const r = await chamarAcaoComFormulario(p, 'actions/branches.ts', 'updateBranch', `/${slug}/settings?tab=unidade`, [rede!.branchId, undefined], {
      name: `${PREFIXO} Unidade pgu${marca}`, phone: telefone,
    })
    expect(r.texto).not.toContain('Forbidden')
    await chamarAcao(p, 'actions/salas.ts', 'criarSala', `/${slug}/settings?tab=unidade`, [rede!.branchId, sala])
  })
  expect((await db().from('branches').select('phone').eq('id', rede!.branchId).single<{ phone: string | null }>()).data?.phone, 'o telefone da unidade dela').toBe(telefone)
  expect((await db().from('rooms').select('id').eq('branch_id', rede!.branchId).eq('name', sala)).data?.length, 'a sala dela').toBe(1)
})

test('na tela, quem não é a Admin da rede lê "Esta configuração é só da Admin da rede" e não acha o botão; a Admin da rede edita', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    for (const aba of ['tags', 'permissions', 'fichas', 'documentos', 'integrations', 'general']) {
      await p.goto(`/${slug}/settings?tab=${aba}`)
      await expect.soft(p.locator('[data-config-da-rede]'), `a aba ${aba} diz de quem é`).toContainText('Esta configuração é só da Admin da rede')
    }
    await p.goto(`/${slug}/settings?tab=tags`)
    await expect(p.getByRole('button', { name: 'Criar tag' }), 'sem o botão de criar tag').toHaveCount(0)
    // O aviso de antes ("alterar aqui muda para todas as unidades") convidava a mexer.
    await expect(p.getByText(/Alterar aqui muda para todas as unidades/)).toHaveCount(0)

    await p.goto(`/${slug}/oportunidades`)
    await expect(p.getByRole('heading', { name: 'Oportunidades' }).first()).toBeVisible()
    await expect(p.getByTitle('Configurar funis'), 'sem "Configurar funis"').toHaveCount(0)
  })
  await como(browser, daRede!, async p => {
    await p.goto('/admin/settings?tab=tags')
    await expect(p.locator('[data-config-da-rede]'), 'a sócia da rede lê de quem é').toContainText('Esta configuração é só da Admin da rede')
    // Diz quem muda, pelo nome: a Admin da rede (A5 da 14ª).
    await expect(p.locator('[data-quem-muda]')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Criar tag' })).toHaveCount(0)
    await p.goto('/admin/oportunidades')
    await expect(p.getByRole('heading', { name: 'Oportunidades' }).first()).toBeVisible()
    await expect(p.getByTitle('Configurar funis')).toHaveCount(0)
    await expect(p.locator('[data-aviso-dos-funis]')).toContainText('quem muda é a Admin da rede')
  })
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=tags')
    await expect(p.getByRole('button', { name: 'Criar tag' }), 'controle: a dona cria tag').toBeVisible()
    await expect(p.locator('[data-config-da-rede]')).toHaveCount(0)
    await p.goto('/admin/oportunidades')
    await expect(p.getByTitle('Configurar funis').first(), 'controle: a dona configura os funis').toBeVisible()
  })
})
