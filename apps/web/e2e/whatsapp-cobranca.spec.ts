import { test, expect, type Page, type Browser } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirGraphFalsa, type GraphFalsa } from './apoio/graph-falsa'

/**
 * O que a Meta cobra da clínica (2026-10-15, pedido do Heitor). A conta do
 * WhatsApp é da clínica e é ELA quem paga a Meta (somos Tech Provider, não
 * revendemos). O sistema:
 *  - diz ANTES quanto um template custa (e, com a janela aberta, que a
 *    resposta digitada sai mais barata);
 *  - reconhece a recusa por falta de forma de pagamento (131042) — no envio e
 *    no webhook — e diz isso, em vez de "a janela fechou";
 *  - guarda o que a Meta marcou como cobrado em cada mensagem e mostra o mês
 *    de cada número em Configurações, com o aviso de pagamento recusado;
 *  - avisa, ao conectar um número oficial, que a cobrança é na conta dela.
 * Rede própria: a caixa oficial falsa nem encosta na rede real.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const SEGREDO = `segredo-${marca}`
const FONE_ID = `e2ecob${Date.now()}`
const WABA = `waba-cob-${marca}`

interface Fx {
  graph: GraphFalsa; outra: OutraRede; gestor: MembroDeTeste
  caixa: string; conv: string; tel: string; tplPromo: string; tplLembrete: string
}
let f: Fx | null = null

test.beforeAll(async () => {
  const b = db()
  const graph = await subirGraphFalsa()
  const outra = await criarOutraRede(`cob${marca}`)
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const caixa = await ins('whatsapp_numbers', {
    tenant_id: outra.tenantId, provider: 'official', label: `${PREFIXO} Cobrança ${marca}`,
    is_active: true, is_default: true, phone_number_id: FONE_ID, waba_id: WABA,
    config: { provider: 'official', phoneNumberId: FONE_ID, wabaId: WABA, accessToken: 'x', verifyToken: 'x', appSecret: SEGREDO, graphBase: graph.url },
  })
  const tel = '5548' + String(Date.now()).slice(-9)
  // Janela FECHADA: o cliente escreveu há dois dias.
  const doisDias = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const conv = await ins('conversations', {
    tenant_id: outra.tenantId, status: 'open', channel: 'whatsapp', provider: 'official', whatsapp_number_id: caixa,
    contact_name: `${PREFIXO} Cobrança ${marca}`, contact_phone: tel, contact_external_id: tel,
    contact_aliases: [tel], last_message_at: doisDias, last_inbound_at: doisDias,
  })
  const tpl = (nome: string, category: string) => ins('message_templates', {
    tenant_id: outra.tenantId, name: `e2e_${nome}_${marca}`, language: 'pt_BR', status: 'APPROVED',
    category, body_text: 'Olá, tudo bem? Temos novidades para você.', waba_id: WABA,
  })
  f = {
    graph, outra, caixa, conv, tel,
    tplPromo: await tpl('promo', 'MARKETING'),
    tplLembrete: await tpl('lembrete', 'UTILITY'),
    gestor: await criarMembro(`cobg${marca}`, {
      tenant: outra.tenantId, rotulo: 'Gestor WhatsApp',
      permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' }],
    }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const { data: convs } = await b.from('conversations').select('id').eq('tenant_id', f.outra.tenantId)
  await apagarConversas((convs ?? []).map(c => c.id as string))
  olhar('templates', await b.from('message_templates').delete().eq('tenant_id', f.outra.tenantId))
  olhar('caixas', await b.from('whatsapp_numbers').delete().eq('tenant_id', f.outra.tenantId))
  olhar('eventos', await b.from('domain_events').delete().eq('tenant_id', f.outra.tenantId))
  await f.gestor.limpar()
  await f.outra.limpar()
  await f.graph.fechar()
  expect(falhas).toEqual([])
})

async function comoGestor<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: f!.gestor.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** A resposta da action (a linha `1:` do protocolo; em dev há linhas de depuração). */
function devolvido(texto: string): unknown {
  for (const l of texto.split('\n').filter(x => x.startsWith('1:'))) {
    try { return JSON.parse(l.slice(2)) } catch { /* linha de depuração */ }
  }
  return undefined
}

const enviarTemplate = async (p: Page, tpl: string) => {
  const r = await chamarAcao(p, 'actions/inbox.ts', 'sendTemplateMessage', '/admin/inbox', [f!.conv, tpl, {}])
  const corpo = devolvido(r.texto) as { ok: boolean; error?: string; message?: { id: string } } | undefined
  expect(corpo, `resposta da action: ${r.texto.slice(0, 300)}`).toBeTruthy()
  return corpo!
}

const mensagem = async (id: string) =>
  (await db().from('messages')
    .select('id, status, external_id, erro_codigo, erro_texto, cobranca_categoria, cobrada, created_at')
    .eq('id', id).single()).data as {
      id: string; status: string; external_id: string | null; erro_codigo: number | null; erro_texto: string | null
      cobranca_categoria: string | null; cobrada: boolean | null; created_at: string
    }

/** Status assinado com o segredo da caixa, como a Meta entrega. */
async function status(p: Page, valor: Record<string, unknown>) {
  const corpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: WABA, changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '5548900000000', phone_number_id: FONE_ID },
      statuses: [{ recipient_id: f!.tel, timestamp: String(Math.floor(Date.now() / 1000)), ...valor }],
    } }] }],
  })
  const assinatura = `sha256=${createHmac('sha256', SEGREDO).update(corpo).digest('hex')}`
  const r = await p.request.post('/api/webhooks/whatsapp', {
    data: corpo, headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinatura },
  })
  expect(r.status(), await r.text()).toBe(200)
}

test.describe.serial('o que a Meta cobra da clínica', () => {
  test('o template diz quanto a Meta cobra antes de enviar', async ({ browser }) => {
    await comoGestor(browser, async p => {
      await p.setViewportSize({ width: 1280, height: 860 })
      await p.goto(`/admin/inbox?c=${f!.conv}`)
      await p.getByTitle('Enviar um template aprovado').click()
      const janela = p.getByRole('dialog', { name: 'Enviar template' })
      const escolha = janela.locator('select')
      await escolha.selectOption(f!.tplPromo)
      const aviso = janela.locator('[data-custo-do-template]')
      await expect(aviso).toContainText(/marketing/i)
      await expect(aviso).toContainText('R$ 0,32')
      await escolha.selectOption(f!.tplLembrete)
      await expect(aviso).toContainText(/utilidade/i)
      await expect(aviso).toContainText('R$ 0,035')
    })
  })

  test('sem forma de pagamento na Meta, a recusa diz isso — não "a janela fechou"', async ({ browser }) => {
    f!.graph.falharMensagens({ code: 131042, message: '(#131042) Business eligibility payment issue' })
    try {
      await comoGestor(browser, async p => {
        const r = await enviarTemplate(p, f!.tplPromo)
        expect(r.ok).toBe(false)
        expect(r.error).toMatch(/forma de pagamento/i)
        expect(r.error).not.toMatch(/janela/i)
      })
    } finally {
      f!.graph.falharMensagens(null)
    }
    const { data } = await db().from('messages').select('id, status, erro_codigo')
      .eq('conversation_id', f!.conv).eq('direction', 'outbound')
    expect(data).toEqual([expect.objectContaining({ status: 'failed', erro_codigo: 131042 })])
  })

  test('o webhook grava o que a Meta cobrou e a falha de pagamento que chega depois', async ({ browser }) => {
    await comoGestor(browser, async p => {
      // Saiu e foi entregue — cobrada como marketing.
      const entregue = await enviarTemplate(p, f!.tplPromo)
      expect(entregue.ok, entregue.error).toBe(true)
      const a = await mensagem(entregue.message!.id)
      await status(p, { id: a.external_id, status: 'sent',
        pricing: { billable: true, pricing_model: 'PMP', category: 'marketing', type: 'regular' } })
      await status(p, { id: a.external_id, status: 'delivered',
        pricing: { billable: true, pricing_model: 'PMP', category: 'marketing', type: 'regular' } })
      // O "lido" chega sem pricing: não apaga a cobrança gravada.
      await status(p, { id: a.external_id, status: 'read' })
      expect(await mensagem(a.id)).toMatchObject({ status: 'read', cobranca_categoria: 'marketing', cobrada: true })

      // A Meta aceitou o envio e recusou depois, pelo webhook.
      const depois = await enviarTemplate(p, f!.tplLembrete)
      expect(depois.ok, depois.error).toBe(true)
      const b = await mensagem(depois.message!.id)
      await status(p, { id: b.external_id, status: 'failed',
        errors: [{ code: 131042, title: 'Business eligibility payment issue', message: 'x' }] })
      const falhada = await mensagem(b.id)
      expect(falhada).toMatchObject({ status: 'failed', erro_codigo: 131042 })
      expect(falhada.erro_texto).toMatch(/forma de pagamento/i)
    })
  })

  test('a bolha que não saiu diz por quê', async ({ browser }) => {
    await comoGestor(browser, async p => {
      await p.setViewportSize({ width: 1280, height: 860 })
      await p.goto(`/admin/inbox?c=${f!.conv}`)
      await expect(p.locator('[data-motivo-da-falha]').first()).toContainText(/forma de pagamento/i)
    })
  })

  test('Configurações mostra o mês do número na Meta e o pagamento recusado', async ({ browser }) => {
    await comoGestor(browser, async p => {
      await p.goto('/admin/settings?tab=integrations')
      const linha = p.locator(`[data-numero="${f!.caixa}"]`)
      const mes = linha.locator('[data-cobranca-do-mes]')
      await expect(mes).toContainText(/marketing/i)
      await expect(mes).toContainText('1')
      await expect(mes).toContainText('R$ 0,32')
      await expect(linha.locator('[data-pagamento-recusado]')).toContainText(/forma de pagamento/i)
    })
  })

  test('ao conectar um número oficial, o aviso de que a Meta cobra na conta da clínica', async ({ browser }) => {
    await comoGestor(browser, async p => {
      await p.goto('/admin/settings?tab=integrations')
      await p.getByRole('button', { name: 'Adicionar número' }).click()
      await p.getByRole('button', { name: /^WhatsApp Oficial/ }).click()
      await expect(p.locator('[data-aviso-de-cobranca]')).toContainText(/forma de pagamento/i)
    })
  })
})
