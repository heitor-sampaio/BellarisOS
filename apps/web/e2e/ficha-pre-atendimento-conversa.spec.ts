import { createHash } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirUazapiFalsa, type UazapiFalsa } from './apoio/uazapi-falsa'

/**
 * A ficha de pré-atendimento pela conversa do inbox (2026-10-21, decisão do
 * Heitor: a MESMA chave do link de assinatura — `documentos_link_pela_conversa`).
 *
 * Numa rede `[e2e]`, com uma caixa uazapi FALSA (o envio roda inteiro, sem
 * mensagem chegar a ninguém):
 * - desligada, a action recusa, nada sai e nenhum link nasce;
 * - ligada, o botão aparece no agendamento e o link sai pela conversa da
 *   cliente, pela caixa dela — a mensagem não fala de saúde nem do procedimento;
 * - cliente sem conversa: recusa sem gerar link.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const sufixo = String(Date.now()).slice(-8)
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let falsa: UazapiFalsa | null = null
let caixa = ''
const conversas: string[] = []
const clientes = { a: '', c: '' }
const agendamentos = { a: '', c: '' }
// Daqui a 2 dias, dentro da grade da agenda.
const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 2 * 86_400_000))

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendada(rotulo: string, cpf: string, hora: number) {
  const cliente = await rede!.criarCliente(rotulo)
  expect((await db().from('clients').update({ document: cpf }).eq('id', cliente)).error).toBeNull()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(`${DIA}T${String(hora).padStart(2, '0')}:00:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return { cliente, agendamento: data!.id }
}

const linksDe = async (cliente: string) => {
  const { data: pre } = await db().from('pre_atendimentos').select('id').eq('client_id', cliente).eq('status', 'PENDENTE').single<{ id: string }>()
  return (await db().from('pre_atendimento_links').select('token_hash, revoked_at').eq('pre_atendimento_id', pre!.id)).data ?? []
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pv${marca}`)
  await db().from('tenants').update({ pre_atendimento_envio: true }).eq('id', rede.tenantId)
  recepcao = await criarMembro(`pvr${marca}`, {
    tenant: rede.tenantId, permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  falsa = await subirUazapiFalsa()
  const { data: cx, error: eCx } = await db().from('whatsapp_numbers').insert({
    tenant_id: rede.tenantId, provider: 'uazapi', label: `${PREFIXO} Caixa ficha ${marca}`, is_active: true, is_default: true,
    config: { token: `e2e-ficha-${marca}`, baseUrl: falsa.url },
  }).select('id').single<{ id: string }>()
  expect(eCx).toBeNull()
  caixa = cx!.id

  const a = await agendada('Ficha conversa', '52998224725', 9)
  const c = await agendada('Ficha sem conversa', '11144477735', 10)
  clientes.a = a.cliente; agendamentos.a = a.agendamento
  clientes.c = c.cliente; agendamentos.c = c.agendamento

  const tel = `55479${sufixo}`
  const { data: cv, error: eCv } = await db().from('conversations').insert({
    tenant_id: rede.tenantId, status: 'open', channel: 'whatsapp', provider: 'uazapi', whatsapp_number_id: caixa,
    client_id: clientes.a, contact_name: `${PREFIXO} Ficha ${marca}`, contact_phone: tel, contact_external_id: tel,
    contact_aliases: [tel], last_message_at: new Date().toISOString(), last_message: 'oi', last_inbound_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eCv, 'criar a conversa').toBeNull()
  conversas.push(cv!.id)
})

test.afterAll(async () => {
  await apagarConversas(conversas)
  if (rede) await db().from('whatsapp_numbers').delete().eq('tenant_id', rede.tenantId)
  await falsa?.fechar()
  await recepcao?.limpar()
  await rede?.limpar()
})

test.describe.serial('pré-atendimento: a ficha pela conversa do inbox', () => {
  test('desligada: sem botão, e a action recusa sem gerar link nem mandar nada', async ({ browser }) => {
    await como(browser, async page => {
      await page.goto(`/admin/agenda?date=${DIA}`)
      await page.locator(`[title*="Ficha conversa pv${marca}"]`).first().click()
      const ficha = page.locator('[data-pre-atendimento-do-agendamento]')
      await expect(ficha.getByRole('button', { name: 'Enviar a ficha' })).toBeVisible()
      await expect(ficha.getByRole('button', { name: 'Mandar pela conversa' })).toHaveCount(0)
      const r = await chamarAcao(page, 'actions/pre-atendimento.ts', 'enviarFichaPelaConversa', '/admin/agenda', [agendamentos.a])
      expect(r.texto).toContain('desligado nesta rede')
    })
    expect(falsa!.chamadas.filter(c => c.caminho.includes('send'))).toEqual([])
    expect(await linksDe(clientes.a)).toEqual([])
  })

  test('ligada: o link sai pela conversa da cliente, pela caixa dela', async ({ browser }) => {
    await db().from('tenants').update({ documentos_link_pela_conversa: true }).eq('id', rede!.tenantId)
    await como(browser, async page => {
      await page.goto(`/admin/agenda?date=${DIA}`)
      await page.locator(`[title*="Ficha conversa pv${marca}"]`).first().click()
      const ficha = page.locator('[data-pre-atendimento-do-agendamento]')
      await ficha.getByRole('button', { name: 'Mandar pela conversa' }).click()
      await expect(ficha.getByText('Link enviado pela conversa do WhatsApp da clínica.')).toBeVisible()
    })

    const { data: msgs } = await db().from('messages').select('content, status, direction, whatsapp_number_id')
      .eq('conversation_id', conversas[0]!)
    expect(msgs).toHaveLength(1)
    const msg = msgs![0]!
    expect(msg).toMatchObject({ status: 'sent', direction: 'outbound', whatsapp_number_id: caixa })
    // A prévia aparece na tela de bloqueio: nada de saúde, nada do procedimento.
    expect(msg.content as string).not.toMatch(/saúde|alergia|Procedimento/i)
    const token = /\/pre-atendimento\/([A-Za-z0-9_-]{43})/.exec(msg.content as string)?.[1]
    expect(token, 'a mensagem leva o link').toBeTruthy()
    const enviadas = falsa!.chamadas.filter(c => c.caminho.includes('send'))
    expect(enviadas).toHaveLength(1)
    expect(JSON.stringify(enviadas[0]!.corpo)).toContain(token!)
    expect((await linksDe(clientes.a)).filter(l => !l.revoked_at)).toEqual([{ token_hash: sha(token!), revoked_at: null }])
  })

  test('cliente sem conversa: recusa sem gerar link', async ({ browser }) => {
    await como(browser, async page => {
      const r = await chamarAcao(page, 'actions/pre-atendimento.ts', 'enviarFichaPelaConversa', '/admin/agenda', [agendamentos.c])
      expect(r.texto).toContain('não tem conversa aberta')
    })
    expect(await linksDe(clientes.c)).toEqual([])
  })
})
