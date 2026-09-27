import { test, expect, type Browser } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'
import { membroComEscopoProprio, type MembroDeTeste } from './apoio/sessao'

/**
 * Quais números de WhatsApp um cargo vê no inbox — escolha do CARGO
 * (`tenant_roles.inbox_caixas`, 2026-09-27).
 *
 * O cenário: duas caixas, "Atendimento" e "Comercial", uma conversa em cada, e
 * uma do Instagram (sem caixa). A SDR está ligada só ao Atendimento.
 *
 * O cargo tem CRM com escopo ALL de propósito: com "só os meus", uma conversa
 * sumida poderia ter sumido pela regra do dono, e o teste passaria sem provar
 * nada sobre as caixas.
 *
 * O Instagram é o controle: ele não tem caixa e tem de aparecer sempre — sem
 * ele, uma lista vazia por qualquer motivo passaria por "escondeu certo".
 */

const marca = Date.now().toString(36)
const DO_ATENDIMENTO = `${PREFIXO} Cx Atend ${marca}`
const DO_COMERCIAL   = `${PREFIXO} Cx Comerc ${marca}`
const DO_INSTAGRAM   = `${PREFIXO} Cx Insta ${marca}`

interface Cenario { caixas: string[]; convIds: string[] }

const segredo = (nome: string) => `segredo-${nome.replace(/\W+/g, '-')}`

/**
 * Abre `/admin/inbox?c=<id>` e devolve tudo que as server actions responderam.
 *
 * O link põe a conversa como selecionada mesmo quando ela não está na lista, e
 * a tela chama `getMessages(id)` na hora — era exatamente por aqui que a
 * conversa escondida vazava. Olhar a RESPOSTA, e não a tela, é o que prova: a
 * tela não desenha a conversa que não está na lista, com ou sem o furo.
 */
async function respostasAoAbrir(browser: Browser, membro: MembroDeTeste, conversationId: string) {
  const ctx  = await browser.newContext({ storageState: membro.estado })
  const page = await ctx.newPage()
  const corpos: Promise<string>[] = []
  page.on('response', r => {
    if (r.request().method() === 'POST' && r.request().headers()['next-action']) {
      corpos.push(r.text().catch(() => ''))
    }
  })
  await page.goto(`/admin/inbox?c=${conversationId}`)
  await page.waitForLoadState('networkidle')
  const tudo = (await Promise.all(corpos)).join('\n')
  await ctx.close()
  return { tudo, chamadas: corpos.length }
}

async function montar(): Promise<Cenario> {
  const db     = banco()
  const tenant = await tenantId()
  const c: Cenario = { caixas: [], convIds: [] }

  for (const rotulo of ['Atendimento', 'Comercial']) {
    const { data, error } = await db.from('whatsapp_numbers')
      .insert({
        tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} ${rotulo} ${marca}`,
        is_active: true, config: { token: `e2e-cx-${rotulo}-${marca}`, baseUrl: 'https://e2e.invalido' },
      })
      .select('id').single<{ id: string }>()
    expect(error, `criar a caixa ${rotulo}`).toBeNull()
    c.caixas.push(data!.id)
  }

  const agora = new Date().toISOString()
  const conversa = async (nome: string, caixa: string | null, i: number) => {
    const externo = caixa ? '5548' + String(Date.now() + i).slice(-9) : `IGSID_E2E_${marca}_${i}`
    const { data, error } = await db.from('conversations')
      .insert({
        tenant_id: tenant, status: 'open',
        channel: caixa ? 'whatsapp' : 'instagram', provider: caixa ? 'uazapi' : null,
        whatsapp_number_id: caixa, contact_name: nome,
        contact_phone: caixa ? externo : null,
        contact_external_id: externo, contact_aliases: [externo],
        last_message_at: agora, last_message: 'oi',
      })
      .select('id').single<{ id: string }>()
    expect(error, `criar a conversa ${nome}`).toBeNull()
    c.convIds.push(data!.id)

    // Um texto que só existe nesta conversa: é por ele que o teste da abertura
    // por id sabe se o servidor entregou as mensagens.
    const { error: erroMsg } = await db.from('messages').insert({
      conversation_id: data!.id, tenant_id: tenant, direction: 'inbound',
      content: segredo(nome), channel: 'manual', status: 'delivered',
    })
    expect(erroMsg, `criar a mensagem de ${nome}`).toBeNull()
  }

  await conversa(DO_ATENDIMENTO, c.caixas[0]!, 41)
  await conversa(DO_COMERCIAL,   c.caixas[1]!, 43)
  await conversa(DO_INSTAGRAM,   null,         47)
  return c
}

async function inboxDe(browser: Browser, membro: MembroDeTeste) {
  const ctx  = await browser.newContext({ storageState: membro.estado })
  const page = await ctx.newPage()
  await page.goto('/admin/inbox')
  await page.waitForLoadState('networkidle')
  return { ctx, page }
}

async function ligar(membro: MembroDeTeste, caixa: string | null) {
  const db = banco()
  await db.from('whatsapp_number_users').delete().eq('user_id', membro.userId)
  if (caixa) {
    const { error } = await db.from('whatsapp_number_users')
      .insert({ whatsapp_number_id: caixa, user_id: membro.userId, tenant_id: await tenantId() })
    expect(error, 'ligar a SDR ao número').toBeNull()
  }
}

async function cargoVe(membro: MembroDeTeste, valor: 'todas' | 'minhas') {
  const { error } = await banco().from('tenant_roles')
    .update({ inbox_caixas: valor }).eq('id', membro.roleId)
  expect(error, `pôr o cargo em "${valor}"`).toBeNull()
}

test.describe.serial('caixas que o cargo vê no inbox', () => {
  let sdr: MembroDeTeste | null = null
  let cenario: Cenario | null = null

  test.beforeAll(async () => {
    sdr = await membroComEscopoProprio(`cx${marca}`, { escopo: 'ALL', inboxCaixas: 'minhas' })
    cenario = await montar()
  })

  test.afterAll(async () => {
    if (cenario) {
      await apagarConversas(cenario.convIds)
      await banco().from('whatsapp_numbers').delete().in('id', cenario.caixas)
    }
    if (sdr) await sdr.limpar()
  })

  test('"só as da pessoa": vê o número dela, não o outro, e o Instagram sempre', async ({ browser }) => {
    await ligar(sdr!, cenario!.caixas[0]!)
    const { ctx, page } = await inboxDe(browser, sdr!)
    try {
      await expect(page.getByText(DO_INSTAGRAM).first(), 'o controle: conversa sem caixa aparece').toBeVisible()
      await expect(page.getByText(DO_ATENDIMENTO).first(), 'a conversa do número dela aparece').toBeVisible()
      await expect(page.getByText(DO_COMERCIAL), 'a conversa de outro número some').toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('abrir pelo id a conversa escondida não entrega as mensagens', async ({ browser }) => {
    await ligar(sdr!, cenario!.caixas[0]!)

    // O controle: a conversa do número dela, pelo mesmo caminho, entrega o
    // texto. Sem isto, "não achou o segredo" poderia ser o teste que não olha.
    const permitida = await respostasAoAbrir(browser, sdr!, cenario!.convIds[0]!)
    expect(permitida.tudo, 'a conversa do número dela abre pelo link')
      .toContain(segredo(DO_ATENDIMENTO))

    const escondida = await respostasAoAbrir(browser, sdr!, cenario!.convIds[1]!)
    expect(escondida.chamadas, 'a tela tem de ter pedido as mensagens, senão o teste não prova nada')
      .toBeGreaterThan(0)
    expect(escondida.tudo, 'a conversa de outro número não pode sair pelo id')
      .not.toContain(segredo(DO_COMERCIAL))
  })

  test('"só as da pessoa" sem número ligado: nenhum WhatsApp', async ({ browser }) => {
    await ligar(sdr!, null)
    const { ctx, page } = await inboxDe(browser, sdr!)
    try {
      await expect(page.getByText(DO_INSTAGRAM).first()).toBeVisible()
      // Sem número não é "vê tudo": o erro nesta direção seria o vazamento.
      await expect(page.getByText(DO_ATENDIMENTO)).toHaveCount(0)
      await expect(page.getByText(DO_COMERCIAL)).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('"todas as caixas": vê as duas, com ou sem número ligado', async ({ browser }) => {
    await cargoVe(sdr!, 'todas')
    await ligar(sdr!, cenario!.caixas[0]!)
    const { ctx, page } = await inboxDe(browser, sdr!)
    try {
      await expect(page.getByText(DO_ATENDIMENTO).first()).toBeVisible()
      await expect(page.getByText(DO_COMERCIAL).first()).toBeVisible()
      await expect(page.getByText(DO_INSTAGRAM).first()).toBeVisible()
    } finally {
      await ctx.close()
      await cargoVe(sdr!, 'minhas')
    }
  })
})

test('a escolha fica na linha do CRM, na aba Cargos, e é gravada ao salvar', async ({ page }) => {
  const db     = banco()
  const tenant = await tenantId()
  const { data: cargo, error } = await db.from('tenant_roles')
    .insert({ tenant_id: tenant, key: `E2E_CX_${marca}`, label: `${PREFIXO} Cargo Cx ${marca}` })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  try {
    await db.from('role_permissions').insert({
      tenant_id: tenant, role_id: cargo!.id, module: 'crm', level: 'MANAGE', scope: 'ALL',
    })

    await page.goto('/admin/settings?tab=permissions')
    await page.waitForLoadState('networkidle')
    await page.getByText(`${PREFIXO} Cargo Cx ${marca}`).first().click()

    const explicacao = page.getByTestId('explicacao-caixas')
    await expect(explicacao, 'padrão: nenhum cargo muda de visão sem alguém pedir')
      .toContainText('todos os números')

    await page.getByRole('button', { name: 'Só as da pessoa' }).click()
    await expect(explicacao).toContainText('Sem número ligado')
    await page.getByRole('button', { name: 'Salvar acessos' }).click()
    await expect(page.getByText('Acessos salvos.')).toBeVisible()

    const { data } = await db.from('tenant_roles').select('inbox_caixas').eq('id', cargo!.id).single()
    expect(data!.inbox_caixas, 'a tela disse "salvos" — o banco tem de concordar').toBe('minhas')
  } finally {
    await db.from('role_permissions').delete().eq('role_id', cargo!.id)
    await db.from('tenant_roles').delete().eq('id', cargo!.id)
  }
})

test('renomear um cargo grava de verdade', async ({ page }) => {
  // Achado junto (2026-09-27): `tenant_roles` não tinha policy de UPDATE, e o
  // renomear respondia "sucesso" atingindo zero linhas. A tela fechava o campo
  // e, recarregada, mostrava o nome antigo.
  const db     = banco()
  const tenant = await tenantId()
  const antes  = `${PREFIXO} Renomear ${marca}`
  const depois = `${PREFIXO} Renomeado ${marca}`
  const { data: cargo, error } = await db.from('tenant_roles')
    .insert({ tenant_id: tenant, key: `E2E_REN_${marca}`, label: antes })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  try {
    await page.goto('/admin/settings?tab=permissions')
    await page.waitForLoadState('networkidle')

    const card = page.locator('div', { hasText: antes }).filter({ has: page.getByTitle('Renomear') }).last()
    await card.getByTitle('Renomear').click()
    const campo = page.getByLabel('Nome do cargo')
    await campo.fill(depois)
    await page.getByTitle('Salvar').click()

    await expect.poll(async () => {
      const { data } = await db.from('tenant_roles').select('label').eq('id', cargo!.id).single()
      return data!.label
    }, { message: 'o nome novo tem de estar no banco' }).toBe(depois)
  } finally {
    await db.from('tenant_roles').delete().eq('id', cargo!.id)
  }
})
