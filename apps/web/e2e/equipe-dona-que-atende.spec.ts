import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * D2 da simulação de 2026-10-29: a dona da clínica (Admin da rede) não
 * conseguia se marcar como quem atende. No editor dela o Cargo não tinha
 * "Admin da rede" e vinha com o primeiro cargo da lista selecionado — salvar o
 * "Atende clientes" a rebaixaria —, e `updateTeamMember` recusava o cargo de
 * sistema. Ela não aparecia na agenda, e a avaliação que fez ficou no nome de
 * outra profissional (histórico, comissão, relatórios).
 *
 * Agora: o cargo de sistema dela aparece travado, o "atende" e o horário se
 * gravam sem tocar no cargo, o cargo de Admin da rede não se troca pela
 * Equipe, a última Admin ativa não se desativa, e a Equipe da UNIDADE lista
 * quem é da rede e atende ali (A5/A7), sem deixar a unidade editá-la.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let socia: MembroDeTeste | null = null
let gerenteDaUnidade: MembroDeTeste | null = null
const nomeDaDona = `${PREFIXO} Dona dad${marca}`
const nomeDaGerente = `${PREFIXO} Gerente dag${marca}`

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Os nomes de quem o agendar da equipe oferece na unidade. */
async function quemAtendeNa(p: Page, branchId: string): Promise<string[]> {
  const r = await chamarAcao(p, 'actions/appointments.ts', 'dadosParaAgendar', '/admin/agenda', [branchId])
  expect(r.status, r.texto.slice(0, 200)).toBe(200)
  const lista = /"professionals":([\s\S]*?)"rooms"/.exec(r.texto)?.[1] ?? ''
  expect(lista, `a resposta traz a lista: ${r.texto.slice(0, 400)}`).not.toBe('')
  return [...lista.matchAll(/"name":"([^"]+)"/g)].map(m => m[1]!)
}

const membro = async (id: string) =>
  (await db().from('users').select('role_id, branch_id, provides_services, is_active').eq('id', id).single()).data

test.beforeAll(async () => {
  rede = await criarOutraRede(`da${marca}`)
  // O portal da rede manda ao /setup a rede sem onboarding.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug

  dona = await criarMembro(`dad${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  socia = await criarMembro(`das${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Socia', permissoes: [] })
  gerenteDaUnidade = await criarMembro(`dag${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'team', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  for (const m of [dona, socia, gerenteDaUnidade]) {
    if (m) await db().from('domain_events').delete().eq('entidade_id', m.userId)
  }
  await gerenteDaUnidade?.limpar()
  await socia?.limpar()
  await dona?.limpar()
  await rede?.limpar()
})

test('a dona marca "Atende clientes" pela Equipe, continua Admin da rede e entra na agenda da unidade', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    await p.goto('/admin/team')
    await p.getByTitle(`Editar ${nomeDaDona}`).click()
    const modal = p.getByRole('dialog')
    // O cargo dela aparece — travado —, e não o primeiro cargo da lista.
    const cargo = modal.locator(`#tme-role-${dona!.userId}`)
    await expect(cargo).toHaveValue(dona!.roleId)
    await expect(cargo).toBeDisabled()
    await modal.getByLabel(/Atende clientes/).check()
    await modal.getByRole('button', { name: 'Salvar' }).click()
    await expect(modal).toHaveCount(0)
  })

  await expect.poll(async () => (await membro(dona!.userId))?.provides_services, { message: 'gravou o "atende"' }).toBe(true)
  const depois = await membro(dona!.userId)
  expect(depois?.role_id, 'continua Admin da rede').toBe(dona!.roleId)
  expect(depois?.branch_id, 'continua da rede').toBeNull()

  await como(browser, dona!.estado, async p => {
    expect(await quemAtendeNa(p, rede!.branchId), 'pode ser escolhida no agendar').toContain(nomeDaDona)
    await p.goto(`/${slug}/agenda`)
    await expect(p.getByText(nomeDaDona).first()).toBeVisible()
  })
})

test('o cargo de Admin da rede não se troca pela Equipe', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined], {
      userId: dona!.userId, roleId: gerenteDaUnidade!.roleId, scope: 'network', redirectPath: '/admin/team',
    })
    expect(r.texto, 'a action recusa').toMatch(/não se troca pela Equipe/)
  })
  expect((await membro(dona!.userId))?.role_id, 'nada mudou').toBe(dona!.roleId)
})

test('a Equipe da unidade lista quem é da rede e atende ali, sem deixar a unidade editá-la', async ({ browser }) => {
  // Independe da ordem: a dona atende.
  expect((await db().from('users').update({ provides_services: true }).eq('id', dona!.userId)).error).toBeNull()
  await como(browser, gerenteDaUnidade!.estado, async p => {
    await p.goto(`/${slug}/team`)
    const linha = p.getByRole('row', { name: new RegExp(nomeDaDona.replace(/[[\]]/g, '\\$&')) })
    await expect(linha).toBeVisible()
    await expect(linha).toContainText('Da rede')
    await expect(linha).toContainText('Atende')
    await expect(linha.getByTitle(/^Editar /), 'a unidade não edita quem é da rede').toHaveCount(0)
    await expect(linha.getByTitle('Desativar membro')).toHaveCount(0)
    // Controle: a própria gerente, da unidade, tem o lápis.
    await expect(p.getByTitle(`Editar ${nomeDaGerente}`)).toBeVisible()
    // A sócia (da rede, não atende) não entra na lista da unidade.
    await expect(p.getByText(`${PREFIXO} Socia das${marca}`)).toHaveCount(0)
  })
})

test('a última Admin da rede ativa não se desativa', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    // Controle: com duas admins, uma desativa a outra.
    const r1 = await chamarAcao(p, 'actions/team.ts', 'deactivateTeamMember', '/admin/team', [socia!.userId, '/admin/team'])
    expect(r1.status, r1.texto.slice(0, 200)).toBe(200)
  })
  await expect.poll(async () => (await membro(socia!.userId))?.is_active).toBe(false)

  // A gerente da rede (equipe MANAGE) tenta desativar a única que sobrou.
  const gestora = await criarMembro(`dar${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Gestora', permissoes: [{ modulo: 'team', nivel: 'MANAGE' }],
  })
  try {
    await como(browser, gestora.estado, async p => {
      const r = await chamarAcao(p, 'actions/team.ts', 'deactivateTeamMember', '/admin/team', [dona!.userId, '/admin/team'])
      expect(r.texto, 'a action diz por quê').toMatch(/única Admin da rede ativa/)
    })
    expect((await membro(dona!.userId))?.is_active, 'a última admin segue ativa').toBe(true)
  } finally {
    await db().from('domain_events').delete().eq('entidade_id', gestora.userId)
    await gestora.limpar()
  }
})
