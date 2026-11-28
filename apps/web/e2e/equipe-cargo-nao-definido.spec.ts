import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * O cargo de sistema "Não definido" e o cargo que não abre nada
 * (plataforma.md, Equipe e Cargos).
 *
 * O "Não definido" não dá permissão de nada, e a Equipe o dá (o Heitor,
 * 18/11: "pode criar, e quem tem cargo não definido não tem permissão de
 * nada"): fica entre as opções de cargo da Equipe (criar e editar), quem tem
 * a Equipe em Gerenciar o dá, e quem o tem entra e não vê módulo nenhum — o
 * painel diz que ela está sem cargo. Quem atende segue na agenda (o "Atende"
 * não é permissão — decisão do Claude, pelo princípio 3).
 *
 * O cargo que não abre nada se avisa (o Heitor, 18/11: "ok") — na linha da
 * Equipe, na janela de editar, ao salvar e na tela de Cargos —, sem recusar
 * (princípio 2).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let semCargo: MembroDeTeste | null = null
let alvo: MembroDeTeste | null = null
let naoDefinidoId = ''
const emailDoNovo = `e2e-membro-nd${marca}@bellaris.invalid`
const AVISO = 'Sem acesso a nenhum módulo: ela entra e não vê nada.'

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const cargoDe = async (id: string) =>
  (await db().from('users').select('role_id').eq('id', id).single<{ role_id: string | null }>()).data?.role_id ?? null

test.beforeAll(async () => {
  rede = await criarOutraRede(`nd${marca}`)
  // O portal da rede manda ao /setup a rede sem onboarding.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: nd } = await db().from('tenant_roles').select('id')
    .eq('tenant_id', rede.tenantId).eq('key', 'NAO_DEFINIDO').eq('is_system', true).single<{ id: string }>()
  naoDefinidoId = nd!.id

  dona = await criarMembro(`ndd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  // Quem tem a Equipe em Gerenciar, sem ser a Admin da rede.
  gerente = await criarMembro(`ndg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'team', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  // Sem cargo, e marcada no "Atende" da unidade.
  semCargo = await criarMembro(`nds${marca}`, {
    tenant: rede.tenantId, cargoDaRede: 'NAO_DEFINIDO', rotulo: 'Sem cargo', permissoes: [], atendeEm: [rede.branchId],
  })
  alvo = await criarMembro(`nda${marca}`, {
    tenant: rede.tenantId, rotulo: 'Alvo', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  const { data: novo } = await db().from('users').select('id, auth_id').eq('email', emailDoNovo).maybeSingle<{ id: string; auth_id: string }>()
  if (novo) {
    await db().from('domain_events').delete().eq('entidade_id', novo.id)
    await db().from('users').delete().eq('id', novo.id)
    await db().auth.admin.deleteUser(novo.auth_id)
  }
  for (const m of [alvo, semCargo, gerente, dona]) {
    if (m) await db().from('domain_events').delete().eq('entidade_id', m.userId)
  }
  await alvo?.limpar()
  await semCargo?.limpar()
  await gerente?.limpar()
  await dona?.limpar()
  await rede?.limpar()
})

test('quem está sem cargo entra e não vê módulo nenhum; o painel diz por quê', async ({ browser }) => {
  await como(browser, semCargo!.estado, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.locator('[data-painel-sem-acesso]')).toHaveText(
      'Você está sem cargo e ainda não tem acesso a nenhum módulo. Quem tem a Equipe em Gerenciar define o seu cargo.')
    // Nada no menu além do painel.
    for (const nome of ['Agenda', 'Clientes', 'Financeiro', 'Equipe', 'Estoque']) {
      await expect(p.getByRole('link', { name: nome, exact: true }), `o menu não oferece ${nome}`).toHaveCount(0)
    }
    // E a action barra: a agenda não abre nem pelo id.
    const r = await chamarAcao(p, 'actions/appointments.ts', 'dadosParaAgendar', '/admin/agenda', [rede!.branchId])
    expect(r.texto, 'a agenda não responde a quem está sem cargo').not.toMatch(/"professionals":/)
  })
})

test('quem está sem cargo e atende segue na agenda para receber horários (o "Atende" não é permissão)', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    const r = await chamarAcao(p, 'actions/appointments.ts', 'dadosParaAgendar', '/admin/agenda', [rede!.branchId])
    expect(r.status, r.texto.slice(0, 200)).toBe(200)
    expect(r.texto).toContain(`${PREFIXO} Sem cargo nds${marca}`)
    // E a Equipe diz isso na linha dela.
    await p.goto('/admin/team')
    const linha = p.getByRole('row', { name: new RegExp(`Sem cargo nds${marca}`) })
    await expect(linha.locator('[data-sem-acesso]')).toContainText(AVISO)
    await expect(linha.locator('[data-sem-acesso]')).toContainText('aparece na agenda para receber horários')
  })
})

test('a Equipe oferece o "Não definido" ao editar, avisa e grava (princípio 2: avisa, não recusa)', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    await p.goto('/admin/team')
    await p.getByTitle(`Editar ${PREFIXO} Alvo nda${marca}`).click()
    const modal = p.getByRole('dialog')
    const cargo = modal.locator(`#tme-role-${alvo!.userId}`)
    await expect(cargo.locator(`option[value="${naoDefinidoId}"]`)).toHaveText(/Não definido \(sem acesso\)/)
    await expect(modal.locator('[data-cargo-sem-acesso]')).toHaveCount(0)
    await cargo.selectOption(naoDefinidoId)
    await expect(modal.locator('[data-cargo-sem-acesso]')).toContainText(AVISO)
    await modal.getByRole('button', { name: 'Salvar' }).click()
    await expect(modal).toHaveCount(0)
    await expect(p.getByText(AVISO).first(), 'a confirmação avisa').toBeVisible()
  })
  await expect.poll(() => cargoDe(alvo!.userId), { message: 'o cargo foi gravado' }).toBe(naoDefinidoId)
})

test('quem tem a Equipe em Gerenciar dá o "Não definido" (está abaixo de todos), mas não o de Admin da rede', async ({ browser }) => {
  // Independe da ordem: o alvo volta ao cargo dele.
  expect((await db().from('users').update({ role_id: alvo!.roleId }).eq('id', alvo!.userId)).error).toBeNull()
  await como(browser, gerente!.estado, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined], {
      userId: alvo!.userId, roleId: naoDefinidoId, scope: 'network', redirectPath: '/admin/team',
    })
    expect(r.texto, 'grava e avisa').toContain(AVISO)
    expect(await cargoDe(alvo!.userId)).toBe(naoDefinidoId)

    // Controle: o cargo de Admin da rede segue só com a Admin da rede.
    const recusa = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined], {
      userId: alvo!.userId, roleId: dona!.roleId, scope: 'network', redirectPath: '/admin/team',
    })
    expect(recusa.texto).toMatch(/Só quem é Admin/)
    expect(await cargoDe(alvo!.userId)).toBe(naoDefinidoId)
  })
})

test('cadastrar no "Não definido" grava e confirma com o aviso', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'createTeamMember', '/admin/team', [undefined], {
      name: `${PREFIXO} Novo sem cargo ${marca}`, email: emailDoNovo, roleId: naoDefinidoId,
      password: `E2e-${marca}-senha`, scope: 'network', redirectPath: '/admin/team',
    })
    expect(r.texto).toContain(AVISO)
  })
  const { data: novo } = await db().from('users').select('role_id').eq('email', emailDoNovo).single<{ role_id: string }>()
  expect(novo?.role_id).toBe(naoDefinidoId)
})

test('a tela de Cargos diz do cargo que não abre módulo nenhum', async ({ browser }) => {
  const { data: vazio } = await db().from('tenant_roles')
    .insert({ tenant_id: rede!.tenantId, key: `E2E_VAZIO_${marca}`.toUpperCase(), label: `${PREFIXO} Vazio ${marca}` })
    .select('id').single<{ id: string }>()
  try {
    await como(browser, dona!.estado, async p => {
      await p.goto(`/admin/settings?tab=permissions&cargo=${vazio!.id}`)
      const texto = 'Sem acesso a nenhum módulo: quem tem este cargo entra e não vê nada.'
      // R41, o Heitor, 27/11: "Só em cima da matriz (a proposta)" — o cartão não repete o aviso.
      await expect(p.locator(`[data-cargo="${vazio!.id}"] [data-cargo-sem-acesso]`)).toHaveCount(0)
      await expect(p.locator('form [data-cargo-sem-acesso]')).toContainText(texto)
      await expect(p.getByText(texto)).toHaveCount(1)
      // Controle: o cargo com a Agenda não leva o aviso.
      await expect(p.locator(`[data-cargo="${alvo!.roleId}"] [data-cargo-sem-acesso]`)).toHaveCount(0)
    })
  } finally {
    await db().from('tenant_roles').delete().eq('id', vazio!.id)
  }
})
