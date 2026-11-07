import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * A 2ª unidade na 9ª simulação (2026-11-07), a Equipe:
 * - D3 (+A8, A51): a Priscila passou a atender só na Menino Deus, e os 2
 *   agendamentos dela na Moinhos sumiram da grade ("6 atendimentos" e 4 na
 *   tela), sem aviso nem repasse; no app da Rosana, um virou "já no horário".
 *   Decidido pelo princípio 3 (o relatório, "Decidido pelos princípios"):
 *   desmarcar a unidade com agendamentos em aberto ali oferece o repasse do
 *   Desativar (H6) — caso a caso, todos, ou cancelar —, e a grade da unidade
 *   mantém a coluna de quem tem agendamento ali.
 * - D9: a sessão aberta antes de mudar a unidade do membro dava 500 em toda
 *   tela até relogar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let moinhos = ''
let slugMoinhos = ''
let nomeMoinhos = ''
let menino = ''
let slugMenino = ''
const nomeMenino = `${PREFIXO} Menino Deus eu${marca}`
let dona: MembroDeTeste | null = null
let priscila: MembroDeTeste | null = null
let michele: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let cliente = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const nome = async (m: MembroDeTeste) => (await db().from('users').select('name').eq('id', m.userId).single<{ name: string }>()).data!.name
const atende = async (m: MembroDeTeste) => [...(((await db().from('users').select('atende_em').eq('id', m.userId).single<{ atende_em: string[] | null }>()).data?.atende_em) ?? [])].sort()

async function agendar(prof: MembroDeTeste, unidade: string, quando: string): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: unidade, client_id: cliente, procedure_id: rede!.procedureId, professional_id: prof.userId,
    scheduled_at: quando, duration_min: 60, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}
const em = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString()

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`eu${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  moinhos = rede.branchId
  const a = (await db().from('branches').select('slug, name').eq('id', moinhos).single<{ slug: string; name: string }>()).data!
  slugMoinhos = a.slug; nomeMoinhos = a.name
  slugMenino = `e2e-md-eu${marca}`
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: nomeMenino, slug: slugMenino }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  menino = b!.id
  cliente = await rede.criarCliente('Rosana')
  dona = await criarMembro(`eud${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  priscila = await criarMembro(`eup${marca}`, { tenant: rede.tenantId, branchId: moinhos, rotulo: 'Priscila', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  michele = await criarMembro(`eum${marca}`, { tenant: rede.tenantId, branchId: moinhos, rotulo: 'Michele', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  gerente = await criarMembro(`eug${marca}`, { tenant: rede.tenantId, branchId: moinhos, rotulo: 'Gerente', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }] })
  // A Priscila atende nas duas; a Michele, só na Moinhos.
  expect((await db().from('users').update({ atende_em: [moinhos, menino] }).eq('id', priscila.userId)).error).toBeNull()
  expect((await db().from('users').update({ atende_em: [moinhos] }).eq('id', michele.userId)).error).toBeNull()
})

test.afterAll(async () => {
  for (const m of [dona, priscila, michele, gerente]) if (m) await db().from('domain_events').delete().eq('entidade_id', m.userId)
  await gerente?.limpar(); await michele?.limpar(); await priscila?.limpar(); await dona?.limpar()
  await rede?.limpar()
})

test('D3: desmarcar a Moinhos com agendamentos ali pergunta e oferece o repasse (um para a Michele, outro cancelado)', async ({ browser }) => {
  const dia = diaEmQueAUnidadeAbre(3)
  const dez = await agendar(priscila!, moinhos, em(dia, '10:00'))
  const duas = await agendar(priscila!, moinhos, em(dia, '14:00'))
  const nomeDaPriscila = await nome(priscila!)
  const nomeDaMichele = await nome(michele!)

  // O servidor também pergunta: sem a resposta, o "Atende" não muda.
  await como(browser, dona!.estado, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined], {
      userId: priscila!.userId, roleId: priscila!.roleId, scope: 'branch', branchId: moinhos,
      redirectPath: '/admin/team', _atendeEm: '1', atendeEm: menino,
    })
    expect(r.texto, 'devolve os agendamentos para repassar').toContain('repasseDoAtende')
  })
  expect(await atende(priscila!), 'sem a resposta, nada mudou').toEqual([moinhos, menino].sort())

  await como(browser, dona!.estado, async p => {
    await p.goto('/admin/team')
    await p.getByTitle(`Editar ${nomeDaPriscila}`).click()
    const modal = p.getByRole('dialog')
    await modal.getByRole('group', { name: 'Atende clientes em' }).getByRole('checkbox', { name: nomeMoinhos }).uncheck()
    await modal.getByRole('button', { name: 'Salvar' }).click()
    const repasse = modal.locator('[data-repasse-do-atende]')
    await expect(repasse).toContainText(`${nomeDaPriscila} tem 2 agendamentos em aberto em ${nomeMoinhos}`)
    await repasse.locator(`[data-agendamento="${dez}"]`).getByRole('combobox').selectOption({ label: nomeDaMichele })
    await repasse.locator(`[data-agendamento="${duas}"]`).getByRole('combobox').selectOption({ label: 'Cancelar este agendamento' })
    await modal.getByRole('button', { name: 'Salvar e repassar' }).click()
    await expect(modal).toHaveCount(0)
  })
  await expect.poll(() => atende(priscila!), { message: 'atende só na Menino Deus' }).toEqual([menino])
  const d = (await db().from('appointments').select('professional_id, status').eq('id', dez).single()).data!
  expect(d, 'o das 10:00 foi para a Michele').toEqual({ professional_id: michele!.userId, status: 'SCHEDULED' })
  const h = (await db().from('appointment_history').select('description').eq('appointment_id', dez).eq('action', 'REASSIGNED')).data ?? []
  expect(h.map(x => x.description).join(' | ')).toContain(`deixou de atender em ${nomeMoinhos}`)
  const t = (await db().from('appointments').select('status, cancellation_reason').eq('id', duas).single()).data!
  expect(t.status, 'o das 14:00 foi cancelado').toBe('CANCELLED')
  expect(t.cancellation_reason).toContain(nomeMoinhos)
})

test('D3: a grade da Moinhos mantém a coluna de quem tem agendamento ali, mesmo sem atender mais', async ({ browser }) => {
  const dia = diaEmQueAUnidadeAbre(5)
  expect((await db().from('users').update({ atende_em: [menino] }).eq('id', priscila!.userId)).error).toBeNull()
  const ficou = await agendar(priscila!, moinhos, em(dia, '11:00'))
  const nomeDaPriscila = await nome(priscila!)
  try {
    await como(browser, gerente!.estado, async p => {
      await p.goto(`/${slugMoinhos}/agenda?date=${dia}`)
      const coluna = p.locator(`[data-coluna-do-profissional="${nomeDaPriscila}"]`)
      await expect(coluna, 'a coluna dela continua').toHaveCount(1)
      await expect(p.locator('[data-nao-atende-aqui]').filter({ hasText: 'Não atende mais nesta unidade' })).toHaveCount(1)
      await expect(coluna.getByText(`${PREFIXO} Rosana`).first()).toBeVisible()
    })
  } finally {
    await db().from('appointments').delete().eq('id', ficou)
  }
})

test('D9: a sessão aberta antes de mudar a unidade do membro não dá erro: leva à unidade nova, com a agenda dela', async ({ browser }) => {
  const dia = diaEmQueAUnidadeAbre(6)
  const daMenino = await agendar(priscila!, menino, em(dia, '09:00'))
  // A gerente abre a sessão na Moinhos; a dona a muda para a Menino Deus.
  await como(browser, gerente!.estado, async p => {
    await p.goto(`/${slugMoinhos}/agenda`)
    await expect(p).toHaveURL(new RegExp(`/${slugMoinhos}/agenda`))
  })
  await como(browser, dona!.estado, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined], {
      userId: gerente!.userId, roleId: gerente!.roleId, scope: 'branch', branchId: menino, redirectPath: '/admin/team',
    })
    expect(r.texto).toContain('"success":true')
  })
  try {
    await como(browser, gerente!.estado, async p => {
      await p.goto(`/${slugMoinhos}/agenda`)
      await expect(p, 'levada à unidade nova').toHaveURL(new RegExp(`/${slugMenino}/`))
      await expect(p.getByText('Algo deu errado')).toHaveCount(0)
      await p.goto(`/${slugMenino}/agenda?date=${dia}`)
      await expect(p.getByText('Algo deu errado')).toHaveCount(0)
      await expect(p.getByText(`${PREFIXO} Rosana`).first(), 'a agenda da Menino Deus aparece (a sessão vale para ela)').toBeVisible()
    })
  } finally {
    await db().from('appointments').delete().eq('id', daMenino)
  }
})
