import { test, expect } from '@playwright/test'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'

/**
 * "Esqueci a senha" na plataforma (2026-10-06): o link do e-mail volta como
 * `?code=` (PKCE), e o `/auth/confirm` só troca o código por sessão com o
 * VERIFICADOR que o pedido gravou num cookie deste host. Sem ele, a troca
 * falha antes de chegar ao Auth e a tela diz "Link expirado" — foi o que o
 * Heitor viu no primeiro acesso a admin.bellarisos.com.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = `rs${Date.now().toString(36)}`
let atendente: AtendenteDeTeste | null = null

test.beforeAll(async () => {
  atendente = await criarAtendente(marca, { papel: 'ADMIN', semVerificacao: true })
})
test.afterAll(async () => { if (atendente) await atendente.limpar() })

test('pedir nova senha no sistema grava o verificador do PKCE neste host', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const p = await ctx.newPage()
    await p.goto(`${urlDaPlataforma('sistema')}/reset-password`)
    await p.getByLabel('E-mail').fill(atendente!.email)
    await p.getByRole('button', { name: 'Enviar link' }).click()
    // O verificador é gravado ANTES de o Auth mandar o e-mail: vale também
    // quando o limite de envio do projeto recusa (o SMTP padrão manda poucos
    // por hora, e o E2E não pode depender dele).
    await expect(p.getByRole('heading', { name: 'E-mail enviado' }).or(p.getByRole('alert').filter({ hasText: 'Erro ao enviar' })))
      .toBeVisible({ timeout: 15_000 })
    const nomes = (await ctx.cookies(urlDaPlataforma('sistema'))).map(c => c.name)
    expect(nomes.some(n => n.endsWith('-code-verifier')), nomes.join(', ')).toBe(true)
    // Depois do envio a tela leva ao login (e o Next pré-carrega a página):
    // o verificador tem de sobreviver até o clique no e-mail.
    await p.goto(`${urlDaPlataforma('sistema')}/login`)
    const depois = (await ctx.cookies(urlDaPlataforma('sistema'))).map(c => c.name)
    expect(depois.some(n => n.endsWith('-code-verifier')), depois.join(', ')).toBe(true)
  } finally { await ctx.close() }
})
