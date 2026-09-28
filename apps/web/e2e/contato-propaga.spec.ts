import { test, expect, type Browser } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Nome e telefone são da PESSOA (§9.2.1): editar num lugar chega aos outros
 * (`lib/contatos/propagar.ts`).
 *
 * Até 2026-09-28 corrigir o nome numa conversa não mudava a outra conversa da
 * mesma pessoa, nem a pessoa (`contacts`); e corrigir no card da oportunidade
 * não mudava nada fora dele.
 *
 * A pessoa tem quatro conversas:
 *   A e B — WhatsApp, mesmo número, duas caixas → acompanham o telefone
 *   C     — Instagram, sem número            → ganha o número
 *   D     — outro WhatsApp dela, OUTRO número → o telefone NÃO muda (é o destino)
 * e duas oportunidades. O nome vai para todas.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const base = String(Date.now()).slice(-8)
const FONE_P = `55489${base}`      // o número de A e B
const FONE_Q = `55479${base}`      // o outro número dela (D)
const FONE_NOVO = `55489${String(Number(base) + 7).padStart(8, '0')}`

interface Fx {
  outra: OutraRede; membro: MembroDeTeste; contato: string
  convA: string; convB: string; convC: string; convD: string; leads: string[]; caixas: string[]; funil: string
}
let f: Fx | null = null
const criado: { outra?: OutraRede; membro?: MembroDeTeste; convs: string[]; caixas: string[] } = { convs: [], caixas: [] }

test.beforeAll(async () => {
  const b = db()
  const outra = await criarOutraRede(`prop${marca}`)
  criado.outra = outra
  const membro = await criarMembro(`prop${marca}`, {
    tenant: outra.tenantId, rotulo: 'CRM', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }],
  })
  criado.membro = membro
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  for (const n of [1, 2]) {
    criado.caixas.push(await ins('whatsapp_numbers', {
      tenant_id: outra.tenantId, provider: 'uazapi', label: `${PREFIXO} Caixa ${n} ${marca}`, is_active: true,
      config: { token: `e2e-prop-${n}-${marca}`, baseUrl: 'https://e2e.invalido' },
    }))
  }
  const conversa = async (extra: Record<string, unknown>) => {
    const id = await ins('conversations', {
      tenant_id: outra.tenantId, status: 'open', contact_name: `${PREFIXO} Ana ${marca}`,
      last_message_at: new Date().toISOString(), ...extra,
    })
    criado.convs.push(id)
    return id
  }
  const whats = (caixa: string, fone: string) => ({
    channel: 'whatsapp', provider: 'uazapi', whatsapp_number_id: caixa,
    contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
  })
  const convA = await conversa(whats(criado.caixas[0]!, FONE_P))
  const convB = await conversa(whats(criado.caixas[1]!, FONE_P))
  const convC = await conversa({ channel: 'instagram', contact_phone: null, contact_external_id: `IG-${marca}`, contact_aliases: [`IG-${marca}`] })
  const convD = await conversa(whats(criado.caixas[0]!, FONE_Q))

  // A e B acham a mesma pessoa pelo número (gatilho). C e D nasceram com pessoas
  // próprias; ficam ligadas à de A à mão — o cenário é "a mesma pessoa em quatro
  // lugares", como o cruzamento de identidade faria.
  const { data: a } = await b.from('conversations').select('contato_id').eq('id', convA).single()
  const contato = a!.contato_id as string
  const { data: bc } = await b.from('conversations').select('contato_id').eq('id', convB).single()
  expect(bc!.contato_id, 'o mesmo número, a mesma pessoa').toBe(contato)
  const { error: eLiga } = await b.from('conversations').update({ contato_id: contato }).in('id', [convC, convD])
  expect(eLiga).toBeNull()

  const funil = await ins('crm_funnels', { tenant_id: outra.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true })
  const etapa = await ins('crm_stages', { tenant_id: outra.tenantId, funnel_id: funil, name: 'Novo', position: 0 })
  const leads = [
    await ins('leads', { tenant_id: outra.tenantId, name: `${PREFIXO} Ana ${marca}`, phone: FONE_P, conversation_id: convA, crm_stage_id: etapa }),
    await ins('leads', { tenant_id: outra.tenantId, name: `${PREFIXO} Ana ${marca}`, phone: FONE_P, conversation_id: convB, crm_stage_id: etapa }),
  ]
  f = { outra, membro, contato, convA, convB, convC, convD, leads, caixas: criado.caixas, funil }
})

test.afterAll(async () => {
  if (!criado.outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const tenant = criado.outra.tenantId
  const { data: ls } = await b.from('leads').select('id').eq('tenant_id', tenant)
  const ids = (ls ?? []).map(l => l.id as string)
  if (ids.length) {
    olhar('histórico dos leads', await b.from('lead_events').delete().in('lead_id', ids))
    olhar('leads', await b.from('leads').delete().in('id', ids))
  }
  olhar('etapas', await b.from('crm_stages').delete().eq('tenant_id', tenant))
  olhar('funis', await b.from('crm_funnels').delete().eq('tenant_id', tenant))
  await apagarConversas(criado.convs)
  olhar('pessoas', await b.from('contacts').delete().eq('tenant_id', tenant))
  if (criado.caixas.length) olhar('caixas', await b.from('whatsapp_numbers').delete().in('id', criado.caixas))
  await criado.membro?.limpar()
  await criado.outra.limpar()
  expect(falhas).toEqual([])
})

async function estado() {
  const b = db()
  const { data: p } = await b.from('contacts').select('name, phone, identifiers').eq('id', f!.contato).single()
  const { data: cs } = await b.from('conversations').select('id, contact_name, contact_phone').in('id', [f!.convA, f!.convB, f!.convC, f!.convD])
  const { data: ls } = await b.from('leads').select('id, name, phone').in('id', f!.leads)
  const conv = (id: string) => cs!.find(c => c.id === id)!
  return { pessoa: p!, A: conv(f!.convA), B: conv(f!.convB), C: conv(f!.convC), D: conv(f!.convD), leads: ls! }
}

async function como<T>(browser: Browser, fn: (p: import('@playwright/test').Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: f!.membro.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.describe.serial('nome e telefone da pessoa se propagam', () => {
  test('editar numa conversa: a pessoa, as outras conversas e as oportunidades acompanham', async ({ browser }) => {
    const nome = `${PREFIXO} Ana Souza ${marca}`
    await como(browser, p => chamarAcao(p, 'actions/inbox.ts', 'atualizarContato', '/admin/inbox',
      [f!.convA, { nome, telefone: FONE_NOVO }]))

    const e = await estado()
    expect([e.pessoa.name, e.pessoa.phone]).toEqual([nome, FONE_NOVO])
    expect(e.pessoa.identifiers as string[], 'o número novo acha a pessoa').toContain(FONE_NOVO)
    expect([e.A, e.B, e.C, e.D].map(c => c.contact_name), 'o nome vai para as quatro').toEqual([nome, nome, nome, nome])
    expect([e.A.contact_phone, e.B.contact_phone, e.C.contact_phone], 'mesmo número e sem número acompanham').toEqual([FONE_NOVO, FONE_NOVO, FONE_NOVO])
    expect(e.D.contact_phone, 'o OUTRO WhatsApp dela não muda de destino').toBe(FONE_Q)
    expect(e.leads.map(l => [l.name, l.phone])).toEqual([[nome, FONE_NOVO], [nome, FONE_NOVO]])
  })

  test('editar no card da oportunidade: chega à pessoa, às conversas e à outra oportunidade', async ({ browser }) => {
    const nome = `${PREFIXO} Ana S. Lima ${marca}`
    await como(browser, async p => {
      await p.goto('/admin/oportunidades')
      const modal = p.locator('dialog[open]')
      // No CARD: o nome também está nos diálogos fechados de cada card, e o
      // primeiro texto da página é invisível. E o clique antes da hidratação
      // não abre nada: repete até o modal aparecer.
      const card = p.locator('.crm-card').filter({ hasText: `${PREFIXO} Ana Souza ${marca}` }).first()
      await expect(async () => {
        await card.click()
        await expect(modal.locator('input[name="name"]')).toBeVisible({ timeout: 2000 })
      }).toPass({ timeout: 30_000 })
      await modal.locator('input[name="name"]').fill(nome)
      await modal.getByRole('button', { name: 'Salvar' }).click()
      await expect(modal).toBeHidden()
    })
    await expect.poll(async () => (await estado()).pessoa.name).toBe(nome)
    const e = await estado()
    expect([e.A, e.B, e.C, e.D].map(c => c.contact_name)).toEqual([nome, nome, nome, nome])
    expect(e.leads.map(l => l.name), 'as duas oportunidades').toEqual([nome, nome])
    expect(e.D.contact_phone, 'nome não mexe em telefone').toBe(FONE_Q)
  })
})
