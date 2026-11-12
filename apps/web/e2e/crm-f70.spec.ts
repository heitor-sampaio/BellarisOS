import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F70 — o CRM do levantamento das regras.
 *
 * - C27 (ALTA): `updateLead` não conferia o alcance. A SDR com "só os meus"
 *   mandava o id do card de OUTRA pessoa: a linha do card não mudava (o filtro
 *   do dono estava no update), mas os efeitos rodavam mesmo assim — o nome da
 *   PESSOA, as conversas, os procedimentos de interesse e a linha do tempo.
 * - C28 (o telefone do contato e do lead): gravado sem o 55 e sem conferir o
 *   tamanho. A pessoa ficava com "48998761234", e a próxima mensagem do
 *   WhatsApp ("5548998761234") não a achava — nascia outra pessoa.
 * - C31: o motivo de perda DESATIVADO era aceito pelo id.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const base = String(Date.now()).slice(-7)
const FONE = `55489${base}1`
const FONE_NOVO_NACIONAL = `(48) 9${base.slice(0, 4)}-${base.slice(4)}2`
const FONE_NOVO_WHATS = `55489${base}2`

interface Fx {
  rede: OutraRede; gestora: MembroDeTeste; sdr: MembroDeTeste
  etapa: string; perdida: string; leadDaGestora: string; contato: string; conversa: string; motivoInativo: string
}
let f: Fx | null = null
const criado: { rede?: OutraRede; membros: MembroDeTeste[]; convs: string[] } = { membros: [], convs: [] }

async function como<T>(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  const b = db()
  const rede = await criarOutraRede(`f70crm${marca}`)
  criado.rede = rede
  const gestora = await criarMembro(`f70g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora', permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  criado.membros.push(gestora)
  const sdr = await criarMembro(`f70s${marca}`, {
    tenant: rede.tenantId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  criado.membros.push(sdr)
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const funil = await ins('crm_funnels', { tenant_id: rede.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true })
  const etapa = await ins('crm_stages', { tenant_id: rede.tenantId, funnel_id: funil, name: 'Novo', position: 0 })
  const perdida = await ins('crm_stages', { tenant_id: rede.tenantId, funnel_id: funil, name: 'Perdido', position: 1, outcome: 'LOST' })
  const conversa = await ins('conversations', {
    tenant_id: rede.tenantId, status: 'open', contact_name: `${PREFIXO} Bruna ${marca}`, channel: 'whatsapp', provider: 'uazapi',
    contact_phone: FONE, contact_external_id: FONE, contact_aliases: [FONE], last_message_at: new Date().toISOString(),
  })
  criado.convs.push(conversa)
  const leadDaGestora = await ins('leads', {
    tenant_id: rede.tenantId, name: `${PREFIXO} Bruna ${marca}`, phone: FONE, conversation_id: conversa,
    crm_stage_id: etapa, owner_id: gestora.userId,
  })
  const { data: l } = await b.from('leads').select('contato_id').eq('id', leadDaGestora).single<{ contato_id: string }>()
  const motivoInativo = await ins('crm_motivos_perda', { tenant_id: rede.tenantId, nome: `${PREFIXO} Desativado ${marca}`, ativo: false })
  f = { rede, gestora, sdr, etapa, perdida, leadDaGestora, contato: l!.contato_id, conversa, motivoInativo }
})

test.afterAll(async () => {
  if (!criado.rede) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const tenant = criado.rede.tenantId
  const { data: ls } = await b.from('leads').select('id').eq('tenant_id', tenant)
  const ids = (ls ?? []).map(l => l.id as string)
  if (ids.length) {
    olhar('procedimentos dos leads', await b.from('lead_procedures').delete().in('lead_id', ids))
    olhar('histórico dos leads', await b.from('lead_events').delete().in('lead_id', ids))
    olhar('leads', await b.from('leads').delete().in('id', ids))
  }
  await apagarConversas(criado.convs)
  for (const m of criado.membros) await m.limpar()
  await criado.rede.limpar()
  expect(falhas).toEqual([])
})

const formDoLead = (leadId: string, extra: Record<string, string>) => ({
  _leadId: leadId, _slug: '', name: `${PREFIXO} Bruna ${marca}`, phone: FONE, ...extra,
})

test.describe.serial('F70 — CRM', () => {
  test('C27: a SDR com "só os meus" não mexe pelo id no card de outra pessoa — nem na pessoa, nem na linha do tempo', async ({ browser }) => {
    const b = db()
    const { count: eventosAntes } = await b.from('lead_events').select('id', { count: 'exact', head: true }).eq('lead_id', f!.leadDaGestora)
    const r = await como(browser, f!.sdr, p => chamarAcaoComFormulario(p, 'actions/leads.ts', 'updateLead', '/admin/oportunidades', [undefined],
      formDoLead(f!.leadDaGestora, { name: `${PREFIXO} Tomada ${marca}`, procedure_ids: JSON.stringify([f!.rede.procedureId]) })))
    expect(r.texto, 'a recusa diz que não achou').toContain('não encontrada')

    const { data: pessoa } = await b.from('contacts').select('name').eq('id', f!.contato).single<{ name: string }>()
    expect(pessoa!.name, 'o nome da PESSOA não muda').toBe(`${PREFIXO} Bruna ${marca}`)
    const { data: conv } = await b.from('conversations').select('contact_name').eq('id', f!.conversa).single<{ contact_name: string }>()
    expect(conv!.contact_name, 'nem o da conversa').toBe(`${PREFIXO} Bruna ${marca}`)
    const { count: procs } = await b.from('lead_procedures').select('lead_id', { count: 'exact', head: true }).eq('lead_id', f!.leadDaGestora)
    expect(procs, 'nem os procedimentos de interesse').toBe(0)
    const { count: eventosDepois } = await b.from('lead_events').select('id', { count: 'exact', head: true }).eq('lead_id', f!.leadDaGestora)
    expect(eventosDepois, 'nem a linha do tempo').toBe(eventosAntes)
  })

  test('C28: o telefone digitado no card vira o do WhatsApp, na oportunidade e na pessoa — e o incompleto é recusado', async ({ browser }) => {
    const b = db()
    const curto = await como(browser, f!.gestora, p => chamarAcaoComFormulario(p, 'actions/leads.ts', 'updateLead', '/admin/oportunidades', [undefined],
      formDoLead(f!.leadDaGestora, { phone: '(48) 9987' })))
    expect(curto.texto).toContain('Telefone incompleto')
    const { data: intacto } = await b.from('leads').select('phone').eq('id', f!.leadDaGestora).single<{ phone: string }>()
    expect(intacto!.phone).toBe(FONE)

    await como(browser, f!.gestora, p => chamarAcaoComFormulario(p, 'actions/leads.ts', 'updateLead', '/admin/oportunidades', [undefined],
      formDoLead(f!.leadDaGestora, { phone: FONE_NOVO_NACIONAL })))
    const { data: lead } = await b.from('leads').select('phone').eq('id', f!.leadDaGestora).single<{ phone: string }>()
    expect(lead!.phone, 'o card guarda no formato do WhatsApp').toBe(FONE_NOVO_WHATS)
    const { data: pessoa } = await b.from('contacts').select('phone, identifiers').eq('id', f!.contato).single<{ phone: string; identifiers: string[] }>()
    expect(pessoa!.phone, 'a pessoa também, com o 55').toBe(FONE_NOVO_WHATS)
    expect(pessoa!.identifiers, 'e a próxima mensagem do número a acha').toContain(FONE_NOVO_WHATS)
  })

  test('C28: o telefone editado no inbox também vira o do WhatsApp, e o incompleto é recusado', async ({ browser }) => {
    const b = db()
    const curto = await como(browser, f!.gestora, p => chamarAcao(p, 'actions/inbox.ts', 'atualizarContato', '/admin/inbox',
      [f!.conversa, { telefone: '(48) 99' }]))
    expect(curto.texto).toContain('Telefone incompleto')

    await como(browser, f!.gestora, p => chamarAcao(p, 'actions/inbox.ts', 'atualizarContato', '/admin/inbox',
      [f!.conversa, { telefone: `(48) 9${base.slice(0, 4)}-${base.slice(4)}3` }]))
    const { data: conv } = await b.from('conversations').select('contact_phone').eq('id', f!.conversa).single<{ contact_phone: string }>()
    expect(conv!.contact_phone).toBe(`55489${base}3`)
    const { data: pessoa } = await b.from('contacts').select('phone').eq('id', f!.contato).single<{ phone: string }>()
    expect(pessoa!.phone).toBe(`55489${base}3`)
  })

  test('C31: o motivo de perda desativado não é aceito pelo id', async ({ browser }) => {
    const r = await como(browser, f!.gestora, p => chamarAcao(p, 'actions/leads.ts', 'updateLeadStage', '/admin/oportunidades',
      [f!.leadDaGestora, f!.perdida, '', { motivoId: f!.motivoInativo }]))
    expect(r.texto).toContain('desativado')
    const { data: lead } = await db().from('leads').select('crm_stage_id, motivo_perda_id').eq('id', f!.leadDaGestora).single<{ crm_stage_id: string; motivo_perda_id: string | null }>()
    expect(lead!.crm_stage_id, 'o card não vai para Perdido').toBe(f!.etapa)
    expect(lead!.motivo_perda_id).toBeNull()
  })
})
