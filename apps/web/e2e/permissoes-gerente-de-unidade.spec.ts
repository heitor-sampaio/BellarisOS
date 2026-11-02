import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * H7 da 5ª simulação (decisão do Heitor, 2026-11-01): "gerente de uma unidade
 * só mexe no que é da unidade".
 *
 * A gerente de unidade fixa da Zona Sul abria "Tags e importações" e o resto de
 * Configurações e gravava o que vale para a clínica inteira (A6) — a tela só
 * avisava que "alterar aqui muda para todas as unidades". A trava é da
 * ABRANGÊNCIA (`ctx.branchId`), não do cargo: com os módulos em Gerenciar, quem
 * tem unidade fixa não grava configuração da rede, pela tela nem pela action
 * direta. Continua mexendo no que é da unidade dela (os dados, o horário e as
 * salas dela). A dona (da rede, com os mesmos gestos) é o controle.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gerente: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let slug = ''
test.describe.configure({ timeout: 180_000 })

const TUDO_EM_GERENCIAR: Permissao[] = (['clients', 'crm', 'settings', 'roles', 'forms', 'automations', 'marketing', 'procedures', 'financial', 'agenda'] as const)
  .map(modulo => ({ modulo, nivel: 'MANAGE' as const, escopo: 'ALL' as const }))

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
  await gerente?.limpar(); await dona?.limpar(); await rede?.limpar()
})

/** Uma gravação de configuração da REDE, chamada direto pela action. */
interface Caso {
  nome: string
  /** A chamada como a pessoa, com o nome que ela grava. */
  chamar: (p: Page, quem: 'gerente' | 'dona') => Promise<unknown>
  /** Quantos registros com o nome de quem gravou (ou o valor que a action mudaria). */
  gravou: (quem: 'gerente' | 'dona') => Promise<unknown>
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
  { nome: 'quem vê o inbox no "só os meus" (Configurações → Cargos)', nada: 'pessoa',
    chamar: (p, q) => chamarAcao(p, 'actions/rede.ts', 'atualizarVisibilidadeDoInbox', `/${slug}/settings?tab=permissions`, [q === 'gerente' ? 'conversa' : 'pessoa']),
    gravou: async () => (await db().from('tenants').select('inbox_visibilidade').eq('id', rede!.tenantId).single<{ inbox_visibilidade: string }>()).data?.inbox_visibilidade,
    semControle: 'a dona grava o padrão' },
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
      name: nome('Campanha', q), type: 'manual', title: 'x', body: 'x', notification_type: 'promo', audience_rules: {},
    }]),
    gravou: q => conta('notification_campaigns', 'name', nome('Campanha', q)) },
]

test('a gerente de unidade fixa não grava configuração da clínica pela action direta; a dona grava', async ({ browser }) => {
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
})

test('a gerente de unidade fixa continua mexendo na unidade dela: os dados, o horário e as salas', async ({ browser }) => {
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

test('na tela, a gerente lê "Esta configuração é da clínica toda" e não acha o botão; a dona edita', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    for (const aba of ['tags', 'permissions', 'fichas', 'documentos', 'integrations', 'general']) {
      await p.goto(`/${slug}/settings?tab=${aba}`)
      await expect.soft(p.locator('[data-config-da-clinica]'), `a aba ${aba} diz de quem é`).toContainText('Esta configuração é da clínica toda')
    }
    await p.goto(`/${slug}/settings?tab=tags`)
    await expect(p.getByRole('button', { name: 'Criar tag' }), 'sem o botão de criar tag').toHaveCount(0)
    // O aviso de antes ("alterar aqui muda para todas as unidades") convidava a mexer.
    await expect(p.getByText(/Alterar aqui muda para todas as unidades/)).toHaveCount(0)

    await p.goto(`/${slug}/oportunidades`)
    await expect(p.getByRole('heading', { name: 'Oportunidades' }).first()).toBeVisible()
    await expect(p.getByTitle('Configurar funis'), 'sem "Configurar funis"').toHaveCount(0)
  })
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=tags')
    await expect(p.getByRole('button', { name: 'Criar tag' }), 'controle: a dona cria tag').toBeVisible()
    await expect(p.locator('[data-config-da-clinica]')).toHaveCount(0)
    await p.goto('/admin/oportunidades')
    await expect(p.getByTitle('Configurar funis').first(), 'controle: a dona configura os funis').toBeVisible()
  })
})
