import { test, expect, type Request } from '@playwright/test'
import { banco, filiaisAtivas, PREFIXO } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { capturarAcao, reenviarAcao } from './apoio/acao'

/**
 * O pedido de dados pessoais (LGPD art. 18) de ponta a ponta — CLAUDE.md §9.2.
 *
 * Até 2026-09-27 não havia teste nenhum aqui: nem do pedido pelo portal, nem
 * do pacote gerado, nem da liberação clínica, nem do cron que recolhe o que
 * ficou para trás. É obrigação legal, e a regra que mais importa é a clínica:
 * o prontuário só entra no pacote DEPOIS que a equipe libera.
 *
 * O caminho real: o cliente pede incluindo o prontuário → o pacote sai logo,
 * SEM a parte clínica (em análise) → a equipe libera → o pacote é regerado COM
 * ela. E o arquivo é de quem pediu: outro cliente, reenviando a mesma chamada,
 * não recebe o link.
 */

const marca = Date.now().toString(36)
const ALERGIA = `${PREFIXO} alergia lgpd ${marca}`

/** O pacote como o CLIENTE o recebe: por link assinado, não pela API de admin. */
async function jsonDoPacote(caminho: string) {
  const { data, error } = await banco().storage.from('lgpd-exports').createSignedUrl(caminho, 60)
  expect(error, 'o pacote tem de estar no bucket').toBeNull()
  const r = await fetch(data!.signedUrl)
  expect(r.ok).toBe(true)
  return await r.json() as { prontuario: unknown; solicitacao: { incluiProntuario: boolean } }
}

test.describe.serial('LGPD: exportação de dados', () => {
  let cliente: ClienteDeTeste | null = null
  let intruso: ClienteDeTeste | null = null
  let pedido = ''
  let baixar: Request | null = null

  test.beforeAll(async () => {
    const unidade = (await filiaisAtivas())[0]!
    cliente = await clienteComSessao(`lgpd${marca}`, unidade)
    intruso = await clienteComSessao(`lgpdx${marca}`, unidade)
    // Um prontuário com anamnese — é por ele que se sabe se a parte clínica entrou.
    await banco().from('medical_records').upsert(
      { client_id: cliente.clientId, general_anamnesis: { allergies: ALERGIA } }, { onConflict: 'client_id' })
  })

  test.afterAll(async () => {
    await cliente?.limpar()
    await intruso?.limpar()
  })

  test('o cliente pede pelo portal; o pacote sai sem o prontuário, que aguarda liberação', async ({ browser }) => {
    const db = banco()
    const ctx = await browser.newContext({ storageState: cliente!.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/${cliente!.slug}/cliente/perfil`)
      await page.locator('input[name="include_medical"]').check()
      await page.getByRole('button', { name: 'Solicitar meus dados' }).click()
      // A tela passa direto para o estado do pedido (a revalidação chega antes
      // da mensagem de sucesso): "Em preparo" e o prontuário em análise.
      await expect(page.getByText('Prontuário em análise')).toBeVisible()
    } finally {
      await ctx.close()
    }

    await expect.poll(async () => {
      const { data } = await db.from('lgpd_requests').select('id, status, medical_status')
        .eq('client_id', cliente!.clientId).single()
      pedido = data?.id ?? ''
      return data ? `${data.status}|${data.medical_status}` : null
    }, { message: 'o after() gera o pacote base na hora', timeout: 30_000 }).toBe('completed|pending')

    const { data: row } = await db.from('lgpd_requests').select('export_json_path, export_pdf_path, expires_at').eq('id', pedido).single()
    expect(row!.export_pdf_path, 'PDF legível').toMatch(/relatorio\.pdf$/)
    const dias = (new Date(row!.expires_at).getTime() - Date.now()) / 86_400_000
    expect(Math.round(dias), 'validade de 30 dias').toBe(30)

    const pacote = await jsonDoPacote(row!.export_json_path)
    expect(pacote.solicitacao.incluiProntuario).toBe(false)
    expect(pacote.prontuario, 'sem liberação, o prontuário NÃO entra').toBe('Não incluído nesta solicitação.')
    expect(JSON.stringify(pacote)).not.toContain(ALERGIA)
  })

  test('um pedido em aberto por cliente — garantido pelo banco', async () => {
    const db = banco()
    const base = { client_id: cliente!.clientId, type: 'export', status: 'pending' }
    const { data: aberto, error: e1 } = await db.from('lgpd_requests').insert(base).select('id').single()
    expect(e1, 'o primeiro em aberto entra (o anterior já foi concluído)').toBeNull()
    const { error: e2 } = await db.from('lgpd_requests').insert(base)
    expect(e2?.code, 'o segundo em aberto esbarra no índice').toBe('23505')
    // Fica aberto para o próximo teste: a liberação clínica precisa lidar com ele.
    expect(aberto!.id).toBeTruthy()
  })

  test('a clínica libera o prontuário e o pacote é regerado com ele', async ({ page }) => {
    const db = banco()
    const nome = `${PREFIXO} Cliente portal lgpd${marca}`
    await page.goto('/admin/settings?tab=lgpd')
    const linha = page.locator('div, li, tr').filter({ hasText: nome })
      .filter({ has: page.getByRole('button', { name: 'Liberar' }) }).last()
    await expect(linha).toContainText('Prontuário a liberar')

    // Com OUTRO pedido aberto (o do teste anterior), liberar reabriria este e
    // esbarraria no índice: a tela diz o motivo, em vez do "duplicate key" cru.
    await linha.getByRole('button', { name: 'Liberar' }).click()
    await expect(page.getByText(/já tem outra solicitação em andamento/)).toBeVisible()

    await db.from('lgpd_requests').delete().eq('client_id', cliente!.clientId).neq('id', pedido)
    await page.reload()
    await page.locator('div, li, tr').filter({ hasText: nome })
      .filter({ has: page.getByRole('button', { name: 'Liberar' }) }).last()
      .getByRole('button', { name: 'Liberar' }).click()

    await expect.poll(async () => {
      const { data } = await db.from('lgpd_requests').select('status, medical_status, medical_reviewed_by, export_json_path').eq('id', pedido).single()
      return data && data.export_json_path ? `${data.status}|${data.medical_status}|${!!data.medical_reviewed_by}` : null
    }, { message: 'liberar regera o pacote com a parte clínica', timeout: 30_000 }).toBe('completed|approved|true')

    const { data: row } = await db.from('lgpd_requests').select('export_json_path').eq('id', pedido).single()
    const pacote = await jsonDoPacote(row!.export_json_path)
    expect(pacote.solicitacao.incluiProntuario).toBe(true)
    expect(JSON.stringify(pacote.prontuario), 'agora o prontuário está no pacote').toContain(ALERGIA)
  })

  test('o cliente baixa o que é dele; outro cliente, pedindo o mesmo id, não', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: cliente!.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/${cliente!.slug}/cliente/perfil`)
      await expect(page.getByText('Prontuário incluído')).toBeVisible()
      const chamada = capturarAcao(page, corpo => corpo.includes(pedido))
      const popup = ctx.waitForEvent('page')
      await page.getByRole('button', { name: 'Baixar dados (JSON)' }).click()
      baixar = await chamada
      const aba = await popup
      expect(aba.url(), 'download por link assinado do bucket privado').toMatch(/lgpd-exports.*token=/)
    } finally {
      await ctx.close()
    }

    const ctxIntruso = await browser.newContext({ storageState: intruso!.estado })
    const pageIntruso = await ctxIntruso.newPage()
    try {
      await pageIntruso.goto(`/${intruso!.slug}/cliente/perfil`)
      const resposta = await reenviarAcao(pageIntruso, baixar!, [])
      const corpo = await resposta.text()
      expect(corpo, 'outro cliente não recebe o link do pacote').not.toMatch(/lgpd-exports.*token=/)
    } finally {
      await ctxIntruso.close()
    }
  })

  test('o cron recolhe o que ficou pendente — e só com o segredo', async ({ request }) => {
    const segredo = process.env.CRON_SECRET
    test.skip(!segredo, 'CRON_SECRET não está no .env.local')
    const db = banco()

    const semSegredo = await request.get('/api/cron/lgpd-exports')
    expect(semSegredo.status(), 'sem o segredo, 401').toBe(401)
    const errado = await request.get('/api/cron/lgpd-exports', { headers: { authorization: 'Bearer errado' } })
    expect(errado.status()).toBe(401)

    // Um pedido que o after() não chegou a processar (processo reiniciado, p.ex.).
    const { data: parado } = await db.from('lgpd_requests')
      .insert({ client_id: intruso!.clientId, type: 'export', status: 'pending' }).select('id').single()
    const r = await request.get('/api/cron/lgpd-exports', { headers: { authorization: `Bearer ${segredo}` } })
    expect(r.ok(), await r.text()).toBe(true)
    const { data } = await db.from('lgpd_requests').select('status, export_pdf_path').eq('id', parado!.id).single()
    expect(data!.status, 'o cron processa o que estava parado').toBe('completed')
    expect(data!.export_pdf_path).toBeTruthy()
  })
})
