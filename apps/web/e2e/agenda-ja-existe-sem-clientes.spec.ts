import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * C66 (H4 = b, o Heitor, 2026-11-11): quem só agenda cria a ficha rápida, mas
 * não mexe na que existe. No "+ Agendar" (e no agendar pelo CRM), "Unificar com
 * a ficha de X" e "Reativar a ficha de X" pedem Clientes em Gerenciar — na tela
 * e na action. Sem ele, a pergunta oferece agendar para a ficha COMO ESTÁ ou
 * cadastrar mesmo assim. Até 2026-11-12 a recepção com Clientes em Ver
 * reativava e reescrevia a ficha pela resposta da pergunta.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let soAgenda: MembroDeTeste | null = null
let comClientes: MembroDeTeste | null = null
const DIA = diaEmQueAUnidadeAbre(9)
let hora = 8

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
function agendarRapido(p: Page, telefone: string, jaExiste = '') {
  return chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
    _branchId: rede!.branchId, _slug: slug, client_id: '', client_name: `Outro nome ${marca}`, client_phone: telefone,
    procedure_id: rede!.procedureId, professional_id: rede!.professionalId, _jaExiste: jaExiste,
    scheduled_at: new Date(`${DIA}T${String(hora++).padStart(2, '0')}:00:00-03:00`).toISOString(),
  })
}
async function fichaCom(telefone: string, ativa: boolean) {
  const id = await rede!.criarCliente(`Ficha ${telefone.slice(-4)}`)
  expect((await db().from('clients').update({ phone: telefone, is_active: ativa }).eq('id', id)).error).toBeNull()
  return id
}
const ficha = async (id: string) => (await db().from('clients').select('is_active, phone').eq('id', id).single<{ is_active: boolean; phone: string }>()).data!
const agendamentosDa = async (id: string) => ((await db().from('appointments').select('id').eq('client_id', id)).data ?? []).length

test.beforeAll(async () => {
  rede = await criarOutraRede(`je${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  soAgenda = await criarMembro(`jea${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção que só agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  comClientes = await criarMembro(`jec${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').eq('branch_id', rede.branchId)).data ?? []).map(a => a.id)
    if (ids.length) await db().from('appointment_history').delete().in('appointment_id', ids)
  }
  await soAgenda?.limpar(); await comClientes?.limpar(); await rede?.limpar()
})

test('C66: com Clientes em Ver, a pergunta não oferece reativar; a action recusa reativar e unificar, e agenda para a ficha como está', async ({ browser }) => {
  const telArquivada = `(48) 9${String(Date.now()).slice(-8, -4)}-${String(Date.now()).slice(-4)}`
  const arquivada = await fichaCom(telArquivada, false)
  const telAtiva = `(48) 8${String(Date.now() + 7).slice(-8, -4)}-${String(Date.now() + 7).slice(-4)}`
  const ativa = await fichaCom(telAtiva, true)
  await como(browser, soAgenda!, async p => {
    const pergunta = await agendarRapido(p, telArquivada)
    expect(pergunta.texto, 'a pergunta diz que ela não unifica').toContain('"podeUnificar":false')
    const reativar = await agendarRapido(p, telArquivada, `atualizar:${arquivada}`)
    expect(reativar.texto, 'a recusa diz por quê').toContain('Clientes em Gerenciar')
    const unificar = await agendarRapido(p, telAtiva, `atualizar:${ativa}`)
    expect(unificar.texto).toContain('Clientes em Gerenciar')
    const usar = await agendarRapido(p, telAtiva, `usar:${ativa}`)
    expect(usar.texto, 'agenda para a ficha como está').toContain('"success":true')
  })
  expect((await ficha(arquivada)).is_active, 'a arquivada continua arquivada').toBe(false)
  expect(await agendamentosDa(arquivada)).toBe(0)
  expect(await agendamentosDa(ativa), 'o agendamento foi para a ficha que existia').toBe(1)
  // Controle: com Clientes em Gerenciar, reativa.
  await como(browser, comClientes!, async p => {
    const r = await agendarRapido(p, telArquivada, `atualizar:${arquivada}`)
    expect(r.texto).toContain('"success":true')
  })
  expect((await ficha(arquivada)).is_active).toBe(true)
})
