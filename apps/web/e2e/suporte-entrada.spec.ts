import { test, expect, type Browser, type BrowserContext } from '@playwright/test'
import { createHash } from 'node:crypto'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { autorizarPor, entrarComo, limparSuporteDaRede, pedirEntrada, sessoesAtivasDaRede } from './apoio/suporte'

/**
 * O "entrar como" ENTRE ORIGENS (2026-10-06): o painel do suporte num host,
 * a conta do membro no da clínica.
 *
 *  - o painel abre a sessão de suporte e entrega à aba nova um CÓDIGO de uso
 *    único (60 s; só o SHA-256 no banco), num formulário que se envia sozinho
 *    para a clínica — o código vai no corpo, fora da URL;
 *  - a clínica consome o código (uma vez só, e só vindo do host do suporte),
 *    abre a sessão REAL do membro com cookie httpOnly NELA, e liga à de suporte;
 *  - a sessão do atendente nunca chega ao domínio da clínica (não há mais o
 *    cookie de volta); o "Sair" leva de volta ao painel, no host do suporte.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = Date.now().toString(36)
const CLINICA = () => process.env.E2E_BASE_URL!
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

let outra: OutraRede | null = null
let alvo: MembroDeTeste | null = null
let gestor: MembroDeTeste | null = null
let atendente: AtendenteDeTeste | null = null

test.beforeAll(async () => {
  test.setTimeout(300_000)
  outra = await criarOutraRede(`se${marca}`)
  alvo = await criarMembro(`sealvo${marca}`, { tenant: outra.tenantId, rotulo: 'Alvo', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  gestor = await criarMembro(`segest${marca}`, { tenant: outra.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
  atendente = await criarAtendente(`se${marca}`, { papel: 'SUPORTE' })
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (outra) falhas.push(...await limparSuporteDaRede(outra.tenantId))
  if (outra) {
    const { error } = await banco().from('support_entry_codes').delete().in('sessao_id',
      ((await banco().from('support_sessions').select('id').eq('tenant_id', outra.tenantId)).data ?? []).map(s => s.id as string))
    if (error) falhas.push(`códigos: ${error.message}`)
  }
  for (const m of [alvo, gestor]) if (m) await m.limpar()
  if (atendente) await atendente.limpar()
  if (outra) await outra.limpar()
  expect(falhas).toEqual([])
})

async function comAtendente<T>(browser: Browser, fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ storageState: atendente!.estado })
  try { return await fn(ctx) } finally { await ctx.close() }
}

const pedido = () => ({ tenantId: outra!.tenantId, userId: alvo!.userId, motivo: 'Conferir o que a clínica relatou' })

/** O POST que a página do painel faz sozinha, com o Origin que o navegador poria. */
async function usarCodigo(ctx: BrowserContext, codigo: string, origem = new URL(urlDaPlataforma('suporte')).origin) {
  return ctx.request.post(`${CLINICA()}/auth/suporte-entrada`, {
    form: { codigo }, headers: { origin: origem }, maxRedirects: 0,
  })
}

/** Encerra o que ficou aberto (para o próximo teste poder abrir de novo). */
async function encerrarTudo() {
  const db = banco()
  const { data } = await db.from('support_sessions').select('id').eq('tenant_id', outra!.tenantId).in('status', ['abrindo', 'ativa'])
  for (const s of (data ?? []) as { id: string }[]) {
    await db.rpc('suporte_sessao_encerrar', { p_sessao: s.id, p_motivo: 'teste', p_falhou: false })
  }
}

test.describe.serial('o "entrar como" entre origens', () => {
  test('o painel entrega um código de uso único, que vai à clínica no corpo — nunca na URL', async ({ browser }) => {
    await autorizarPor(browser, gestor!.estado, alvo!.userId)
    await comAtendente(browser, async ctx => {
      const r = await pedirEntrada(ctx, pedido())
      expect(r.status).toBe(200)
      expect(r.codigo, 'a página traz o código').toBeTruthy()
      expect(r.codigo!.length).toBeGreaterThanOrEqual(40)
      expect(r.destino).toBe(`${CLINICA()}/auth/suporte-entrada`)
      // A página tem de deixar o navegador mandar o Origin dela: com
      // `no-referrer` (ou `same-origin`), o POST entre origens sai com
      // `Origin: null` pela especificação Fetch, e a clínica o recusaria.
      expect(['strict-origin', 'strict-origin-when-cross-origin', 'origin', 'origin-when-cross-origin']).toContain(r.referrerPolicy)
      // No banco, só o hash: o código em si não está em lugar nenhum.
      const { data: guardado } = await banco().from('support_entry_codes').select('hash, usado_em').eq('hash', sha256(r.codigo!))
      expect(guardado).toHaveLength(1)
      expect(guardado![0]!.usado_em).toBeNull()
      const { data: cru } = await banco().from('support_entry_codes').select('hash').eq('hash', r.codigo!)
      expect(cru).toHaveLength(0)
    })
    await encerrarTudo()
  })

  test('o código vale UMA vez: a segunda tentativa não abre nada', async ({ browser }) => {
    await comAtendente(browser, async ctx => {
      const r = await pedirEntrada(ctx, pedido())
      const primeira = await usarCodigo(ctx, r.codigo!)
      expect(primeira.status()).toBe(303)
      expect(primeira.headers().location).toMatch(/\/admin\/dashboard/)
      const segunda = await usarCodigo(ctx, r.codigo!)
      expect(segunda.status()).toBeGreaterThanOrEqual(400)
      expect(segunda.headers()['set-cookie'] ?? '').not.toMatch(/sb-.*-auth-token=[^;]/)
    })
    expect(await sessoesAtivasDaRede(outra!.tenantId)).toHaveLength(1)
    await encerrarTudo()
  })

  test('o pedido de entrada só vale vindo do PRÓPRIO painel — a clínica (mesmo site) não abre sessão pelo cookie do atendente', async ({ browser }) => {
    await comAtendente(browser, async ctx => {
      // app.* e suporte.* são o mesmo SITE: o cookie lax do atendente vai
      // junto num formulário que parta da clínica. Sem conferir o Origin, um
      // script na clínica abriria sessões em outras contas pelo atendente.
      const daClinica = await pedirEntrada(ctx, pedido(), new URL(CLINICA()).origin)
      expect(daClinica.status).toBe(403)
      expect(daClinica.codigo).toBeNull()
      const semOrigem = await pedirEntrada(ctx, pedido(), null)
      expect(semOrigem.status).toBe(403)
    })
    const { data } = await banco().from('support_sessions').select('id').eq('tenant_id', outra!.tenantId).in('status', ['abrindo', 'ativa'])
    expect(data ?? []).toHaveLength(0)
  })

  test('o painel do suporte tem o token do Realtime (só o access token)', async ({ browser }) => {
    await comAtendente(browser, async ctx => {
      const r = await ctx.request.get(`${urlDaPlataforma('suporte')}/api/auth/token`, { headers: { 'sec-fetch-site': 'same-origin' } })
      expect(r.status()).toBe(200)
      const corpo = await r.json() as Record<string, unknown>
      expect(typeof corpo.access_token).toBe('string')
      expect(corpo).not.toHaveProperty('refresh_token')
      // De outro site (a clínica é mesmo site, não mesma origem): recusa.
      const deFora = await ctx.request.get(`${urlDaPlataforma('suporte')}/api/auth/token`, { headers: { 'sec-fetch-site': 'same-site' } })
      expect(deFora.status()).toBe(403)
    })
  })

  test('código vencido e código de outro site são recusados', async ({ browser }) => {
    await comAtendente(browser, async ctx => {
      const r = await pedirEntrada(ctx, pedido())
      // Vindo de outro site (o Origin não é o do suporte): recusa sem consumir.
      const deFora = await usarCodigo(ctx, r.codigo!, 'http://outro.invalid')
      expect(deFora.status()).toBe(403)
      // Vencido.
      const { error } = await banco().from('support_entry_codes')
        .update({ expira_em: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('hash', sha256(r.codigo!))
      expect(error).toBeNull()
      const vencido = await usarCodigo(ctx, r.codigo!)
      expect(vencido.status()).toBeGreaterThanOrEqual(400)
      expect(vencido.headers().location ?? '').not.toMatch(/\/admin\//)
    })
    expect(await sessoesAtivasDaRede(outra!.tenantId)).toHaveLength(0)
    await encerrarTudo()
  })

  test('pela tela: aba nova na clínica com o banner; a sessão do atendente não vai para lá; "Sair" volta ao painel', async ({ browser }) => {
    const sup = await entrarComo(browser, atendente!.estado, outra!.tenantId, `Alvo sealvo${marca}`)
    try {
      // Na clínica, só a sessão do MEMBRO — e nenhum cookie de volta.
      const naClinica = await sup.ctx.cookies(CLINICA())
      expect(naClinica.map(c => c.name)).not.toContain('bellaris_suporte_volta')
      const sessao = naClinica.filter(c => /^sb-.*-auth-token/.test(c.name))
      expect(sessao.length).toBeGreaterThan(0)
      for (const c of sessao) expect(c.httpOnly).toBe(true)
      const valor = sessao.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(c => c.value).join('')
      const json = JSON.parse(Buffer.from(valor.replace(/^base64-/, ''), 'base64url').toString('utf8')) as { user: { id: string } }
      const { data: m } = await banco().from('users').select('auth_id').eq('id', alvo!.userId).single()
      expect(json.user.id).toBe(m!.auth_id)

      // "Sair": encerra e leva ao painel, no host do suporte — onde o
      // atendente continua logado.
      await sup.page.getByRole('link', { name: 'Sair' }).click()
      await expect(sup.page).toHaveURL(`${urlDaPlataforma('suporte')}/redes/${outra!.tenantId}`, { timeout: 30_000 })
      await expect(sup.page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await sessoesAtivasDaRede(outra!.tenantId)).toHaveLength(0)
    } finally { await sup.ctx.close() }
  })
})
