import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F73 — A20 da 14ª simulação. Era: a Bianca, fixa na Savassi, ATENDIA também
 * na Pampulha, e abrir /pampulha/agenda a levava à própria agenda com "Os seus
 * atendimentos nessa unidade estão na sua agenda, aqui".
 *
 * Revisto em 23/11 (o Heitor: "não faz o menor sentido a ana ter marcado
 * atende na sul e se a sul nao esta entre as unidades dela. uma pessoa só pode
 * atender nas unidades que faz parte, isso é obvio"): o "Atende" só vale nas
 * unidades da pessoa. A Equipe recusa marcar a Pampulha no "Atende" de quem é
 * só da Savassi, e a Pampulha, para ela, é uma unidade que não é dela — o
 * aviso de sempre (e2e/abrangencia-aviso-ao-redirecionar.spec.ts).
 */

const marca = `aa${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede
let bianca: MembroDeTeste
let dona: MembroDeTeste
let slugA = ''
let slugB = ''
let pampulha = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const atendeDaBianca = async () => [...(((await db().from('users').select('atende_em').eq('id', bianca.userId)
  .single<{ atende_em: string[] | null }>()).data?.atende_em) ?? [])].sort()

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slugA = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Pampulha ${marca}`, slug: `e2e-aab-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(error).toBeNull()
  slugB = b!.slug
  pampulha = b!.id
  dona = await criarMembro(`d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  bianca = await criarMembro(`b${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional da Savassi',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }], atendeEm: [rede.branchId],
  })
})

test.afterAll(async () => {
  await bianca?.limpar()
  await dona?.limpar()
  await rede?.limpar()
})

test('A20 (revisto em 23/11): a Equipe recusa marcar a Pampulha no "Atende" de quem é só da Savassi', async ({ browser }) => {
  await como(browser, dona.estado, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined], {
      userId: bianca.userId, roleId: bianca.roleId, redirectPath: '/admin/team',
      _atendeEm: '1', atendeEm: `${rede.branchId},${pampulha}`, providesServices: 'on',
    })
    expect(r.texto, r.texto.slice(0, 300)).toMatch(/só vale nas unidades da pessoa/)
    const m = await chamarAcao(p, 'actions/team.ts', 'marcarUnidadeNoAtende', '/admin/team', [bianca.userId, pampulha, '/admin/team'])
    expect(m.texto, m.texto.slice(0, 300)).toMatch(/só vale nas unidades da pessoa/)
  })
  expect(await atendeDaBianca(), 'a Pampulha não entrou').toEqual([rede.branchId])
})

test('A20 (revisto em 23/11): a Pampulha não é dela — o aviso de sempre, não o da agenda', async ({ browser }) => {
  await como(browser, bianca.estado, async p => {
    await p.goto(`/${slugB}/agenda`)
    await expect(p).toHaveURL(new RegExp(`/${slugA}/`))
    await expect(p.getByText('Essa unidade não está entre as suas. Você está na sua unidade.')).toBeVisible()
    await expect(p.getByText('Os seus atendimentos nessa unidade estão na sua agenda', { exact: false })).toHaveCount(0)
  })
})
