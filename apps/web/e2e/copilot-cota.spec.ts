import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, TODAS, type RedeDoCopilot } from './apoio/copilot'

/**
 * O LANÇAMENTO do Copilot (fase 7, 2026-10-08):
 *  - a COTA mensal da rede (decisão do Heitor): o plano diz quantos tokens
 *    por mês (o editor de planos do sistema, em milhões); passou, o painel
 *    avisa e a rota recusa até o mês virar; o consumo aparece no sistema e na
 *    aba Assinatura da clínica;
 *  - a RETENÇÃO: conversa parada há mais de 90 dias sai (o cron);
 *  - a política de privacidade fala da OpenAI e do que NÃO vai a ela.
 */
test.skip(!contraAFalsa() || !plataformaNoAr(), 'só contra o build: a OpenAI falsa e o sistema')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let admin: AtendenteDeTeste

test.beforeAll(async () => {
  test.setTimeout(300_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`cot${marca}`)
  admin = await criarAtendente(`copad${marca}`, { papel: 'ADMIN' })
})
test.afterAll(async () => {
  await db().from('platform_audit_log').delete().eq('tenant_id', rede.outra.tenantId)
  await db().from('platform_plans').delete().like('nome', `[e2e]%${marca}%`)
  await rede?.limpar()
  await admin?.limpar()
  await falsa?.fechar()
})

test('o editor de planos guarda a cota do Copilot (em milhões de tokens por mês)', async ({ browser }) => {
  const nome = `[e2e] Plano cota ${marca}`
  await comSessao(browser, admin.estado, async p => {
    await p.goto(`${urlDaPlataforma('sistema')}/planos`)
    const form = p.locator('form', { hasText: 'Novo plano' })
    await form.locator('input[name="nome"]').fill(nome)
    await form.locator('input[name="valor"]').fill('199,00')
    // O Copilot saiu do "em breve": o rótulo é só o nome.
    await expect(form.getByRole('checkbox', { name: 'Copilot (IA secretária)', exact: true })).toBeChecked()
    await form.getByLabel('Cota mensal do Copilot (milhões de tokens)').fill('2,5')
    await form.getByRole('button', { name: 'Criar plano' }).click()
    await expect(p.getByText('Plano criado.')).toBeVisible({ timeout: 15_000 })
  })
  const { data } = await db().from('platform_plans').select('recursos').eq('nome', nome).single<{ recursos: { cotas?: { copilot: number } } }>()
  expect(data!.recursos.cotas).toEqual({ copilot: 2_500_000 })
})

test('passou da cota: o painel avisa e a rota recusa; o consumo aparece na Assinatura e no sistema', async ({ browser }) => {
  await rede.plano(TODAS, 500)
  falsa.roteiro.push({ texto: 'Primeira resposta.', tokens: { entrada: 500, saida: 100 } })
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const painel = await falarComOCopilot(p, 'oi')
    await esperarResposta(p)
    await expect(painel.locator('.copilot-corpo').getByText('Primeira resposta.')).toBeVisible()

    // 600 de 500: a próxima é recusada antes de chegar ao modelo.
    await falarComOCopilot(p, 'de novo')
    await expect(painel.getByRole('alert')).toContainText('A cota do Copilot deste mês acabou')
    expect(falsa.respostas()).toHaveLength(1)

    await p.goto('/admin/settings?tab=assinatura')
    await expect(p.getByText('Copilot este mês')).toBeVisible()
    await expect(p.getByText('100% da cota usada')).toBeVisible()
  })
  await comSessao(browser, admin.estado, async p => {
    await p.goto(`${urlDaPlataforma('sistema')}/redes/${rede.outra.tenantId}`)
    await expect(p.getByText(/Copilot este mês: 600 tokens · 100% da cota/)).toBeVisible()
  })
})

test('a voz e a volta que cai no meio também contam na cota', async ({ browser }) => {
  // Revisão de 2026-10-08: só a resposta COMPLETA somava; a transcrição e a
  // volta interrompida (a OpenAI cobra o que processou) passavam de graça.
  await rede.plano(TODAS, null)
  await db().from('copilot_uso_mensal').delete().eq('tenant_id', rede.outra.tenantId)
  const uso = async () => Number((await db().from('copilot_uso_mensal').select('tokens')
    .eq('tenant_id', rede.outra.tenantId).maybeSingle<{ tokens: number }>()).data?.tokens ?? 0)
  const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2000, 1)])
  falsa.tokensDaTranscricao = 300
  falsa.roteiro.push({ texto: 'Ouvi.', tokens: { entrada: 100, saida: 20 } })
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/dashboard')
    const postar = (campos: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>) =>
      p.request.post('/api/copilot', { headers: { origin: process.env.E2E_BASE_URL! }, multipart: { pagina: '/admin/dashboard', ...campos } })
    expect(await (await postar({ anexos: { name: 'audio.webm', mimeType: 'audio/webm', buffer: WEBM } })).text()).toContain('"tipo":"fim"')
    expect(await uso(), 'a transcrição soma com a resposta').toBe(420)

    falsa.roteiro.push({ cair: true })
    await (await postar({ texto: 'quantos agendamentos tenho amanhã?' })).text()
    expect(await uso(), 'a volta que caiu conta o que foi mandado').toBeGreaterThan(420)
  })
})

test('a retenção: conversa parada há mais de 90 dias sai; a recente fica', async ({ request }) => {
  const velha = await db().from('copilot_conversas').insert({ tenant_id: rede.outra.tenantId, user_id: rede.dono.userId, titulo: `${PREFIXO} velha`, atualizada_em: new Date(Date.now() - 91 * 86_400_000).toISOString() }).select('id').single<{ id: string }>()
  const nova = await db().from('copilot_conversas').insert({ tenant_id: rede.outra.tenantId, user_id: rede.dono.userId, titulo: `${PREFIXO} nova` }).select('id').single<{ id: string }>()
  expect(velha.error).toBeNull()
  const r = await request.get('/api/cron/copilot-retencao', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  expect(r.status()).toBe(200)
  const restam = (await db().from('copilot_conversas').select('id').in('id', [velha.data!.id, nova.data!.id])).data!.map(c => c.id)
  expect(restam).toEqual([nova.data!.id])
})

test('a retenção também tira a MENSAGEM de mais de 90 dias de uma conversa que segue em uso', async ({ request }) => {
  const conversa = await db().from('copilot_conversas').insert({ tenant_id: rede.outra.tenantId, user_id: rede.dono.userId, titulo: `${PREFIXO} em uso` }).select('id').single<{ id: string }>()
  expect(conversa.error).toBeNull()
  const msg = (dias: number, texto: string) => ({
    conversa_id: conversa.data!.id, tenant_id: rede.outra.tenantId, papel: 'user', conteudo: { texto },
    criada_em: new Date(Date.now() - dias * 86_400_000).toISOString(),
  })
  const ins = await db().from('copilot_mensagens').insert([msg(120, 'antiga'), msg(1, 'recente')]).select('id')
  expect(ins.error).toBeNull()
  const r = await request.get('/api/cron/copilot-retencao', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  expect(r.status()).toBe(200)
  const restam = (await db().from('copilot_mensagens').select('conteudo').eq('conversa_id', conversa.data!.id)).data!
  expect(restam.map(m => (m.conteudo as { texto: string }).texto)).toEqual(['recente'])
})

test('a política de privacidade fala da OpenAI e de que nada clínico vai a ela', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const p = await ctx.newPage()
    await p.goto('/privacidade')
    await expect(p.getByRole('heading', { name: /Copilot/ })).toBeVisible()
    await expect(p.getByText(/OpenAI/).first()).toBeVisible()
    await expect(p.getByText(/prontuário/i).first()).toBeVisible()
    // E não promete demais (revisão de 2026-10-08): o que a equipe anexa vai inteiro.
    await expect(p.getByText('O que a equipe envia vai como está:')).toBeVisible()
    await expect(p.getByText(/não enviar material clínico/)).toBeVisible()
  } finally {
    await ctx.close()
  }
})
