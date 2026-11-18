import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { entrarComPaciencia } from './apoio/suporte'

/**
 * Chamados de suporte (fase 3, 2026-10-03): o botão "Ajuda" da topbar e a
 * fila do /suporte.
 *
 * As regras que este arquivo prova:
 *  - o chamado nasce pela tela com o contexto (tela, quem) e, se a pessoa
 *    marcar, já autoriza o suporte a entrar por 72 h;
 *  - o suporte vê na fila, responde e grava nota interna; a resposta chega no
 *    sino de quem abriu, e a nota interna nunca sai para a clínica;
 *  - "Pedir autorização" deixa a decisão com a clínica;
 *  - o chamado é de quem abriu (e de quem administra a rede): o colega não o
 *    lê nem pela action;
 *  - o sinal da fila só é lido pela plataforma.
 *
 * Numa rede `[e2e]` própria, com o atendente criado pelo teste.
 */

test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')
const SUP = () => urlDaPlataforma('suporte')

const marca = Date.now().toString(36)
const db = () => banco()
const URL_SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ASSUNTO = `A agenda não abre ${marca}`
const NOTA = `NOTA-INTERNA-${marca}`
const RESPOSTA = `Resposta do suporte ${marca}`
// 1×1 transparente: só o cabeçalho importa para o servidor.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

let outra: OutraRede | null = null
const membros: MembroDeTeste[] = []
let atendente: AtendenteDeTeste | null = null
let alvo: MembroDeTeste, colega: MembroDeTeste, gestor: MembroDeTeste
let chamadoId = ''

test.beforeAll(async () => {
  test.setTimeout(600_000)
  outra = await criarOutraRede(`ch${marca}`)
  alvo = await criarMembro(`chalvo${marca}`, {
    tenant: outra.tenantId, rotulo: 'Alvo', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
  colega = await criarMembro(`chcol${marca}`, {
    tenant: outra.tenantId, rotulo: 'Colega', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  // Quem administra a rede: a Admin da rede — desde 18/11, só ela autoriza o
  // suporte a entrar numa conta (no chamado de quem abriu).
  gestor = await criarMembro(`chgest${marca}`, {
    tenant: outra.tenantId, rotulo: 'Gestor', donoDaRede: true, permissoes: [],
  })
  membros.push(alvo, colega, gestor)
  atendente = await criarAtendente(`ch${marca}`, { papel: 'SUPORTE' })
})

test.afterAll(async () => {
  const b = db()
  const falhas: string[] = []
  const anote = (o: string, e: { message: string } | null) => { if (e) falhas.push(`${o}: ${e.message}`) }
  if (outra) {
    const t = outra.tenantId
    const { data: arquivos } = await b.storage.from('suporte-anexos').list(t)
    if (arquivos?.length) anote('anexos', (await b.storage.from('suporte-anexos').remove(arquivos.map(a => `${t}/${a.name}`))).error)
    anote('sessões', (await b.from('support_sessions').delete().eq('tenant_id', t)).error)
    anote('autorizações', (await b.from('support_grants').delete().eq('tenant_id', t)).error)
    anote('chamados', (await b.from('support_tickets').delete().eq('tenant_id', t)).error)
    anote('registros', (await b.from('platform_audit_log').delete().eq('tenant_id', t)).error)
  }
  for (const m of membros) {
    anote('notificações', (await b.from('user_notifications').delete().eq('user_id', m.userId)).error)
    await m.limpar()
  }
  if (atendente) await atendente.limpar()
  if (outra) await outra.limpar()
  expect(falhas).toEqual([])
})

async function rest(token: string, caminho: string): Promise<unknown[]> {
  const r = await fetch(`${URL_SUPA}/rest/v1/${caminho}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
  const corpo = await r.json().catch(() => [])
  return Array.isArray(corpo) ? corpo : []
}

test.describe.serial('chamados de suporte', () => {
  test('a rede abre o chamado pela Ajuda, com print e autorização', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: alvo.estado })
    try {
      const page = await ctx.newPage()
      await page.goto('/admin/dashboard')
      await page.getByRole('button', { name: 'Ajuda', exact: true }).click()
      const janela = page.getByRole('dialog', { name: 'Ajuda' })
      await janela.getByRole('button', { name: 'Novo chamado' }).click()
      await janela.locator('input[name="assunto"]').fill(ASSUNTO)
      await janela.locator('textarea[name="corpo"]').fill('Cliquei na agenda e a tela ficou em branco.')
      await janela.locator('input[name="anexo"]').setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: PNG })
      // Quem não é a Admin da rede não autoriza: a caixa não aparece, e a nota diz quem.
      await expect(janela.getByLabel(/Autorizo o suporte/)).toHaveCount(0)
      await expect(janela.locator('[data-autorizar-so-a-admin]')).toContainText('Admin da rede')
      await janela.getByRole('button', { name: 'Enviar' }).click()
      await expect(janela.getByRole('heading', { name: new RegExp(`· ${ASSUNTO}`) })).toBeVisible({ timeout: 20_000 })
      await expect(janela.getByText(/Acesso do suporte autorizado até/)).toHaveCount(0)
      // A action também recusa o "autorizar" de quem não é a Admin.
      const r = await chamarAcaoComFormulario(page, 'actions/chamados.ts', 'abrirChamado', '/admin/dashboard', [], {
        assunto: `Forçado ${marca}`, corpo: 'x', autorizar: '1',
      })
      expect(r.texto).toContain('só da Admin da rede')
    } finally { await ctx.close() }

    // A Admin da rede autoriza a conta de quem abriu, pela conversa do chamado.
    const chamadoDoAlvo = (await db().from('support_tickets').select('id').eq('tenant_id', outra!.tenantId).eq('assunto', ASSUNTO)
      .single<{ id: string }>()).data!.id
    const ca = await browser.newContext({ storageState: gestor.estado })
    try {
      const page = await ca.newPage()
      await page.goto('/admin/dashboard')
      const janela = page.getByRole('dialog', { name: 'Ajuda' })
      await expect(async () => {
        await page.evaluate(i => window.dispatchEvent(new CustomEvent('bellaris:ajuda', { detail: { chamadoId: i } })), chamadoDoAlvo)
        await expect(janela).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 60_000 })
      await janela.getByRole('button', { name: 'Autorizar por 72 h' }).click()
      await expect(janela.getByText(/Acesso do suporte autorizado até/)).toBeVisible({ timeout: 20_000 })
    } finally { await ca.close() }

    const { data: t, error } = await db().from('support_tickets')
      .select('id, status, opened_by_user_id, contexto').eq('tenant_id', outra!.tenantId).eq('assunto', ASSUNTO)
      .single<{ id: string; status: string; opened_by_user_id: string; contexto: Record<string, unknown> }>()
    expect(error).toBeNull()
    chamadoId = t!.id
    expect(t!.status).toBe('aberto')
    expect(t!.opened_by_user_id).toBe(alvo.userId)
    // O contexto: a tela vem do navegador; quem, da sessão.
    expect(t!.contexto.pagina).toBe('/admin/dashboard')
    expect(String(t!.contexto.usuario)).toContain(`chalvo${marca}`)
    // Desde 18/11 a autorização nasce DEPOIS de aberto o chamado, pela Admin
    // da rede ("Autorizar por 72 h" na conversa): o elo é o `ticket_id` da
    // autorização (gravado na mesma função), não o `grant_id` do chamado, que
    // só o "autorizo" da abertura preenchia.
    const { data: g } = await db().from('support_grants').select('ticket_id, via, target_user_id, revoked_at')
      .eq('ticket_id', t!.id).is('revoked_at', null).single<{ ticket_id: string; via: string; target_user_id: string; revoked_at: string | null }>()
    expect(g).toMatchObject({ ticket_id: chamadoId, via: 'chamado', target_user_id: alvo.userId, revoked_at: null })
    const { data: msgs } = await db().from('support_ticket_messages').select('author_kind, anexos').eq('ticket_id', chamadoId)
    expect(msgs).toHaveLength(1)
    expect((msgs![0]!.anexos as unknown[]).length).toBe(1)
  })

  test('o chamado é de quem abriu: o colega não o lê; quem administra a rede, sim', async ({ browser }) => {
    for (const [quem, ve] of [[colega, false], [gestor, true]] as const) {
      const ctx = await browser.newContext({ storageState: quem.estado })
      try {
        const p = await ctx.newPage()
        const r = await chamarAcao(p, 'actions/chamados.ts', 'verChamado', '/admin/dashboard', [chamadoId])
        if (ve) expect(r.texto).toContain(ASSUNTO)
        else { expect(r.texto).toContain('Chamado não encontrado'); expect(r.texto).not.toContain(ASSUNTO) }
      } finally { await ctx.close() }
    }
  })

  test('o sinal da fila só é lido pela plataforma', async () => {
    expect(await rest(atendente!.accessToken, 'support_signals?select=id')).toHaveLength(1)
    expect(await rest(alvo.accessToken, 'support_signals?select=id')).toHaveLength(0)
    expect(await rest(alvo.accessToken, `support_tickets?select=id&id=eq.${chamadoId}`)).toHaveLength(0)
    expect(await rest(alvo.accessToken, `support_ticket_messages?select=id&ticket_id=eq.${chamadoId}`)).toHaveLength(0)
  })

  test('o suporte vê na fila, grava nota interna e responde', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: atendente!.estado })
    try {
      const page = await ctx.newPage()
      await page.goto(`${SUP()}/chamados`)
      await page.getByRole('link', { name: new RegExp(ASSUNTO) }).click()
      await expect(page.getByRole('heading', { name: new RegExp(ASSUNTO) })).toBeVisible()
      // Com a autorização do chamado, o "Entrar como" está à mão.
      await expect(page.getByRole('button', { name: 'Entrar como' })).toBeVisible()

      await page.getByRole('button', { name: 'Nota interna' }).click()
      await page.locator('textarea[name="corpo"]').fill(NOTA)
      await page.getByRole('button', { name: 'Gravar nota' }).click()
      await expect(page.getByText(NOTA)).toBeVisible({ timeout: 20_000 })

      await page.getByRole('button', { name: 'Nota interna' }).click()
      await page.locator('textarea[name="corpo"]').fill(RESPOSTA)
      await page.getByRole('button', { name: 'Enviar' }).click()
      await expect(page.getByText(RESPOSTA)).toBeVisible({ timeout: 20_000 })
    } finally { await ctx.close() }

    const { data: t } = await db().from('support_tickets').select('status, assigned_staff_id, last_staff_reply_at')
      .eq('id', chamadoId).single<{ status: string; assigned_staff_id: string; last_staff_reply_at: string | null }>()
    expect(t!.status).toBe('aguardando_clinica')
    expect(t!.assigned_staff_id).toBe(atendente!.staffId)
    expect(t!.last_staff_reply_at).not.toBeNull()
    const { data: n } = await db().from('user_notifications').select('type, data').eq('user_id', alvo.userId).eq('type', 'suporte.chamado')
    expect(n, 'só a resposta avisa (a nota interna, não)').toHaveLength(1)
    expect((n![0]!.data as { chamadoId: string }).chamadoId).toBe(chamadoId)
  })

  test('entrar pelo chamado e sair volta ao chamado', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: atendente!.estado })
    try {
      const painel = await ctx.newPage()
      // A conta do membro abre numa aba nova, na clínica (outro host).
      const page = await entrarComPaciencia(painel, async () => {
        await painel.goto(`${SUP()}/chamados/${chamadoId}`)
        await painel.getByRole('button', { name: 'Entrar como' }).click()
        await painel.getByLabel('Motivo do acesso').fill('Ver a agenda que não abre')
        await painel.getByRole('button', { name: 'Entrar', exact: true }).click()
      })
      // No modo suporte não há Ajuda: quem está ali é o atendente.
      await expect(page.getByRole('button', { name: 'Ajuda', exact: true })).toHaveCount(0)
      const { data: s } = await db().from('support_sessions').select('ticket_id').eq('tenant_id', outra!.tenantId).eq('status', 'ativa')
      expect(s).toEqual([{ ticket_id: chamadoId }])
      await page.getByRole('link', { name: 'Sair' }).click()
      // De volta ao chamado, no painel (host do suporte).
      await expect(page).toHaveURL(`${SUP()}/chamados/${chamadoId}`, { timeout: 30_000 })
    } finally { await ctx.close() }
  })

  test('as actions da plataforma recusam um membro da rede', async ({ browser }) => {
    const antes = (await db().from('support_tickets').select('status, assigned_staff_id').eq('id', chamadoId).single()).data
    const ctx = await browser.newContext({ storageState: gestor.estado })
    try {
      const p = await ctx.newPage()
      // A action mora no app do suporte (outro host, onde o membro não tem
      // sessão), e confere a plataforma por si. Qualquer resposta: o banco não muda.
      await chamarAcao(p, 'actions/chamados-suporte.ts', 'mudarSituacaoDoChamado', `${SUP()}/chamados/${chamadoId}`,
        [chamadoId, 'resolvido']).catch(() => null)
      await chamarAcao(p, 'actions/chamados-suporte.ts', 'assumirChamado', `${SUP()}/chamados/${chamadoId}`,
        [chamadoId]).catch(() => null)
    } finally { await ctx.close() }
    const depois = (await db().from('support_tickets').select('status, assigned_staff_id').eq('id', chamadoId).single()).data
    expect(depois).toEqual(antes)
  })

  test('a resposta chega no sino e abre a conversa — sem a nota interna', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: alvo.estado })
    try {
      const page = await ctx.newPage()
      await page.goto('/admin/dashboard')
      await page.getByRole('button', { name: 'Notificações' }).first().click()
      await page.getByText(/O suporte respondeu o chamado/).first().click()
      await page.getByRole('button', { name: 'Ver a resposta' }).click()
      const janela = page.getByRole('dialog', { name: 'Ajuda' })
      await expect(janela.getByText(RESPOSTA)).toBeVisible({ timeout: 20_000 })
      await expect(janela.getByText(NOTA)).toHaveCount(0)

      // Responder volta o chamado para o suporte.
      await janela.locator('textarea[name="corpo"]').fill('Obrigada, voltou a funcionar.')
      await janela.getByRole('button', { name: 'Enviar' }).click()
      await expect(janela.getByText('Obrigada, voltou a funcionar.')).toBeVisible({ timeout: 20_000 })
    } finally { await ctx.close() }
    const { data: t } = await db().from('support_tickets').select('status').eq('id', chamadoId).single<{ status: string }>()
    expect(t!.status).toBe('aberto')
  })

  test('"Pedir autorização" deixa a decisão com a rede', async ({ browser }) => {
    // Um chamado do colega, sem autorização.
    const { data: novo, error } = await db().rpc('chamado_abrir', {
      p_tenant: outra!.tenantId, p_branch: null, p_user: colega.userId, p_assunto: `Sem acesso ${marca}`,
      p_corpo: 'Não vejo o financeiro.', p_contexto: {}, p_anexos: [], p_autorizar: false, p_clinico: false, p_horas: 72,
    })
    expect(error).toBeNull()
    const id = (novo as { chamado_id: string }[])[0]!.chamado_id

    const ctx = await browser.newContext({ storageState: atendente!.estado })
    try {
      const page = await ctx.newPage()
      await page.goto(`${SUP()}/chamados/${id}`)
      await expect(page.getByText('Sem autorização vigente: só a rede libera o acesso.')).toBeVisible()
      await page.getByRole('button', { name: 'Pedir autorização' }).click()
      await expect(page.getByText(/pediu autorização para entrar na sua conta/)).toBeVisible({ timeout: 20_000 })
    } finally { await ctx.close() }
    const { data: g } = await db().from('support_grants').select('id').eq('target_user_id', colega.userId).is('revoked_at', null)
    expect(g, 'o pedido não autoriza nada').toHaveLength(0)
    const { data: n } = await db().from('user_notifications').select('data').eq('user_id', colega.userId).eq('type', 'suporte.chamado')
    expect(n).toHaveLength(1)

    // A rede decide pela conversa: o colega lê que quem autoriza é a Admin da
    // rede, e ela autoriza a conta dele ali mesmo (2026-11-18).
    const abrirAConversa = async (page: import('@playwright/test').Page) => {
      await page.goto('/admin/dashboard')
      const janela = page.getByRole('dialog', { name: 'Ajuda' })
      // O evento só abre a janela depois de a Ajuda hidratar (é ela que o
      // escuta); sob a carga da completa, o primeiro pode sair antes.
      await expect(async () => {
        await page.evaluate(i => window.dispatchEvent(new CustomEvent('bellaris:ajuda', { detail: { chamadoId: i } })), id)
        await expect(janela).toBeVisible({ timeout: 3_000 })
      }).toPass({ timeout: 60_000 })
      return janela
    }
    const cc = await browser.newContext({ storageState: colega.estado })
    try {
      const janela = await abrirAConversa(await cc.newPage())
      await expect(janela.locator('[data-autorizar-so-a-admin]')).toContainText('autorização da Admin da rede')
      await expect(janela.getByRole('button', { name: 'Autorizar por 72 h' })).toHaveCount(0)
    } finally { await cc.close() }
    const cg = await browser.newContext({ storageState: gestor.estado })
    try {
      const janela = await abrirAConversa(await cg.newPage())
      await janela.getByRole('button', { name: 'Autorizar por 72 h' }).click()
      await expect(janela.getByText(/Acesso do suporte autorizado até/)).toBeVisible({ timeout: 20_000 })
    } finally { await cg.close() }
    const { data: g2 } = await db().from('support_grants').select('ticket_id').eq('target_user_id', colega.userId).is('revoked_at', null)
    expect(g2).toEqual([{ ticket_id: id }])
  })
})
