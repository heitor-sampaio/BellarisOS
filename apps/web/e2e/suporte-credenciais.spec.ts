import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao } from './apoio/acao-direta'
import { apagarAgendamentos } from './apoio/limpeza'
import {
  sessaoDoNavegador, sessaoDoToken, rest, restBruto, authApi, renovar, autorizarPor, entrarComo, sessoesAtivasDaRede, limparSuporteDaRede,
} from './apoio/suporte'

/**
 * O que a sessão de suporte NÃO faz, mesmo com o cargo do membro deixando:
 *  - credencial: e-mail, senha e fator de acesso da conta (o banco barra, e é
 *    pela API do Auth com o token que se prova);
 *  - aparelho de push na conta do membro (seguiria recebendo o sino depois);
 *  - login novo na equipe, cargo e permissão (acesso permanente, fora do prazo);
 *  - nada sai para o paciente: mensagem, template, campanha, link de
 *    assinatura — e o push do agendamento não vai ao cliente;
 *  - re-autorizar troca as regras: a sessão em curso cai;
 *  - vencer o prazo mata o token e o refresh;
 *  - o "Sair" por link não desloga um membro comum.
 * Cada recusa tem o controle (o próprio membro, ou o admin) quando cabe.
 */

test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = Date.now().toString(36)
const db = () => banco()
const QUALQUER = '00000000-0000-4000-8000-000000000000'

let outra: OutraRede | null = null
const membros: MembroDeTeste[] = []
let atendente: AtendenteDeTeste | null = null
let alvo: MembroDeTeste
let clienteId = ''
const agendamentos: string[] = []
let sup: { ctx: BrowserContext; page: Page } | null = null

async function agendamento(): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: outra!.branchId, client_id: clienteId, procedure_id: outra!.procedureId,
    professional_id: outra!.professionalId, status: 'SCHEDULED', source: 'INTERNAL',
    scheduled_at: new Date(Date.now() + 48 * 3600_000 + agendamentos.length * 3600_000).toISOString(), duration_min: 30, price: 0,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamentos.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(600_000)
  outra = await criarOutraRede(`sk${marca}`)
  alvo = await criarMembro(`skalvo${marca}`, {
    tenant: outra.tenantId, rotulo: 'Alvo',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' },
      { modulo: 'marketing', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'team', nivel: 'MANAGE' },
      { modulo: 'settings', nivel: 'MANAGE' },
    ],
  })
  membros.push(alvo)
  atendente = await criarAtendente(`sk${marca}`, { papel: 'SUPORTE' })
  clienteId = await outra.criarCliente('Paciente Credenciais')
})

test.afterAll(async () => {
  if (sup) await sup.ctx.close()
  const falhas: string[] = []
  if (outra) falhas.push(...await limparSuporteDaRede(outra.tenantId))
  const b = db()
  if (clienteId) {
    const { error } = await b.from('client_notifications').delete().eq('client_id', clienteId)
    if (error) falhas.push(`notificações do cliente: ${error.message}`)
  }
  await apagarAgendamentos(agendamentos)
  const { error: eUsr } = await b.from('users').delete().like('email', `e2e-suporte-criado-${marca}%`)
  if (eUsr) falhas.push(`membro criado: ${eUsr.message}`)
  for (const m of membros) {
    const { error } = await b.from('user_notifications').delete().eq('user_id', m.userId)
    if (error) falhas.push(`notificações: ${error.message}`)
    await m.limpar()
  }
  if (atendente) await atendente.limpar()
  if (outra) await outra.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('suporte: credenciais e travas', () => {
  test('entra com autorização', async ({ browser }) => {
    await autorizarPor(browser, alvo.estado, alvo.userId)
    sup = await entrarComo(browser, atendente!.estado, outra!.tenantId, `Alvo skalvo${marca}`)
    expect(await sessoesAtivasDaRede(outra!.tenantId)).toHaveLength(1)
  })

  test('e-mail, senha e fator de acesso da conta não mudam', async () => {
    const token = (await sessaoDoNavegador(sup!.ctx)).access_token
    expect(await authApi(token, 'PUT', 'user', { email: `trocado-${marca}@bellaris.invalid` })).not.toBe(200)
    expect(await authApi(token, 'PUT', 'user', { password: `Nova-${marca}-x9!` })).not.toBe(200)
    expect(await authApi(token, 'POST', 'factors', { factor_type: 'totp', friendly_name: `sup-${marca}` })).not.toBe(200)
  })

  test('não registra aparelho de push na conta do membro', async () => {
    const token = (await sessaoDoNavegador(sup!.ctx)).access_token
    const r = await restBruto(token, 'POST', 'push_tokens', { user_id: alvo.userId, token: `fcm-${marca}`, platform: 'android' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    const { data } = await db().from('push_tokens').select('id').eq('token', `fcm-${marca}`)
    expect(data ?? []).toHaveLength(0)
  })

  test('não cria login na equipe nem mexe em cargo', async () => {
    const p = sup!.page
    await p.goto('/admin/team')
    await p.getByRole('button', { name: 'Adicionar membro' }).click()
    const janela = p.getByRole('dialog', { name: 'Novo membro da equipe' })
    await janela.locator('#tm-name').fill(`[e2e] Criado pelo suporte ${marca}`)
    await janela.locator('#tm-email').fill(`e2e-suporte-criado-${marca}@bellaris.invalid`)
    await janela.locator('#tm-role').selectOption({ index: 1 })
    const rede = janela.getByText('Rede inteira')
    if (await rede.count()) await rede.first().click()
    await janela.locator('#tm-password').fill(`Senha-${marca}-x9`)
    await janela.locator('button[type="submit"]').click()
    await expect(janela.getByText(/modo suporte/)).toBeVisible({ timeout: 20_000 })
    const { data } = await db().from('users').select('id').like('email', `e2e-suporte-criado-${marca}%`)
    expect(data ?? []).toHaveLength(0)
  })

  test('nada sai para o paciente: template, campanha e link de assinatura', async () => {
    const p = sup!.page
    const t = await chamarAcao(p, 'actions/inbox.ts', 'sendTemplateMessage', '/admin/inbox', [QUALQUER, QUALQUER, {}])
    expect(t.texto).toContain('modo suporte')
    const c = await chamarAcao(p, 'actions/notification-campaigns.ts', 'activateCampaign', '/admin/notificacoes', [QUALQUER])
    expect(c.texto).toContain('modo suporte')
    const l = await chamarAcao(p, 'actions/documentos.ts', 'gerarLinkDeAssinatura', `/admin/clients/${clienteId}`, [QUALQUER])
    expect(l.texto).toContain('modo suporte')
  })

  test('o cancelamento feito no suporte não manda push ao cliente', async ({ browser }) => {
    const noSuporte = await agendamento()
    const r = await chamarAcao(sup!.page, 'actions/appointments.ts', 'updateAppointmentStatus', '/admin/agenda',
      [noSuporte, 'CANCELLED', 'x', 'Cancelado no teste do suporte'])
    expect(r.status).toBe(200)
    const { data: ap } = await db().from('appointments').select('status').eq('id', noSuporte).single<{ status: string }>()
    expect(ap!.status).toBe('CANCELLED')

    // Controle: o próprio membro cancelando avisa o cliente.
    const controle = await agendamento()
    const ctx = await browser.newContext({ storageState: alvo.estado })
    try {
      const p = await ctx.newPage()
      await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', '/admin/agenda',
        [controle, 'CANCELLED', 'x', 'Cancelado pelo membro'])
    } finally { await ctx.close() }
    await expect.poll(async () => {
      const { data } = await db().from('client_notifications').select('data').eq('client_id', clienteId)
      return ((data ?? []) as { data: { appointment_id?: string } | null }[]).map(n => n.data?.appointment_id)
    }, { timeout: 20_000 }).toContain(controle)
    const { data } = await db().from('client_notifications').select('data').eq('client_id', clienteId)
    expect(((data ?? []) as { data: { appointment_id?: string } | null }[]).map(n => n.data?.appointment_id)).not.toContain(noSuporte)
  })

  test('re-autorizar troca as regras: a sessão em curso cai', async ({ browser }) => {
    const capturada = await sessaoDoNavegador(sup!.ctx)
    await autorizarPor(browser, alvo.estado, alvo.userId, { horas: 72 })
    expect(await sessoesAtivasDaRede(outra!.tenantId)).toHaveLength(0)
    expect(await rest(capturada.access_token, `clients?select=id&id=eq.${clienteId}`)).toHaveLength(0)
    expect(await renovar(capturada.refresh_token)).toBe(false)
    await sup!.page.goto('/admin/dashboard')
    // De volta ao painel, no host do suporte (ou ao login, sem a sessão de suporte).
    await expect(sup!.page).toHaveURL(new RegExp(`^${urlDaPlataforma('suporte')}/|/login`), { timeout: 30_000 })
    await sup!.ctx.close()
    sup = null
  })

  test('vencer o prazo mata o token e o refresh', async ({ browser }) => {
    sup = await entrarComo(browser, atendente!.estado, outra!.tenantId, `Alvo skalvo${marca}`)
    const capturada = await sessaoDoNavegador(sup.ctx)
    // A sessão é a do TOKEN, não "a primeira ativa da rede": sob o limite do
    // Auth, a entrada pode ter tentado mais de uma vez.
    const sessao = await sessaoDoToken(capturada.access_token)
    expect(sessao.status).toBe('ativa')
    const { error } = await db().from('support_sessions').update({ expires_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', sessao.id)
    expect(error).toBeNull()
    // Vencida, a RLS já nega na hora (o estado é lido do banco a cada transação).
    expect(await rest(capturada.access_token, `clients?select=id&id=eq.${clienteId}`)).toHaveLength(0)
    // A próxima tela encerra a sessão vencida (o servidor a guarda por até
    // 15 s) e apaga a do Auth: o refresh morre. (O cron faz o mesmo para quem
    // não navega mais — spec isolado não chama cron.)
    await expect.poll(async () => {
      await sup!.page.goto('/admin/dashboard')
      return sup!.page.url()
    }, { timeout: 45_000, intervals: [5_000] }).not.toMatch(/\/admin\//)
    expect(await renovar(capturada.refresh_token)).toBe(false)
    await sup.ctx.close()
    sup = null
  })

  test('o "Sair" do suporte por link não desloga um membro comum', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: alvo.estado })
    try {
      const p = await ctx.newPage()
      // Sem sessão de suporte, o "Sair" só devolve ao início — e o membro
      // continua no portal dele. (Navegar de novo logo depois atropelava o
      // redirecionamento: ERR_ABORTED no CI.)
      await p.goto('/auth/suporte-fim')
      await p.waitForURL(/\/admin\/dashboard/, { timeout: 30_000 })
    } finally { await ctx.close() }
    // Controle da trava de credencial: sem sessão de suporte, o membro troca a senha.
    expect(await sessoesAtivasDaRede(outra!.tenantId)).toHaveLength(0)
    expect(await authApi(alvo.accessToken, 'PUT', 'user', { password: `Nova-${marca}-x9!` })).toBe(200)
  })
})
