import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * O sino do agendamento novo. Era a D7 da simulação de 2026-10-28: quem tinha
 * a agenda "só os meus" só era avisado do registro DELE. Sem o "só os meus"
 * (SM1, o Heitor, 2026-11-23), quem tem a Agenda em Gerenciar é responsável
 * por todos os da unidade e recebe os dois; o profissional do agendamento é
 * avisado do dele (o "envolvido direto"). Quem agendou não é avisado do que fez.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let propria: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
const DIA = diaEmQueAUnidadeAbre(2)

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const avisos = async (userId: string, appointmentId: string) => {
  const { count, error } = await db().from('user_notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('type', 'appointment_new').eq('data->>appointment_id', appointmentId)
  expect(error).toBeNull()
  return count ?? 0
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`no${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  // Como a Renata: da rede, atende, com a Agenda em Gerenciar.
  propria = await criarMembro(`nop${marca}`, {
    tenant: rede.tenantId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', propria.userId)).error).toBeNull()
  gerente = await criarMembro(`nog${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
  recepcao = await criarMembro(`nor${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').eq('branch_id', rede.branchId)).data ?? []).map(a => a.id)
    for (const id of ids) await db().from('user_notifications').delete().eq('data->>appointment_id', id)
    if (ids.length) await db().from('appointment_history').delete().in('appointment_id', ids)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await propria?.limpar(); await gerente?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

// Sem o "só os meus" (SM1, o Heitor, 2026-11-23): a Agenda em Gerenciar é avisada de todos.
test('quem tem a Agenda em Gerenciar recebe o aviso do agendamento dela e o de outra; quem agendou, não', async ({ browser }) => {
  const agendar = async (p: Page, rotulo: string, professionalId: string, hora: string) => {
    const cliente = await rede!.criarCliente(rotulo)
    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
      _slug: slug, _branchId: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId,
      professional_id: professionalId, scheduled_at: new Date(`${DIA}T${hora}:00-03:00`).toISOString(),
    })
    const { data, error } = await db().from('appointments').select('id').eq('client_id', cliente).single<{ id: string }>()
    expect(error, `agendou: ${r.texto.slice(-200)}`).toBeNull()
    return data!.id
  }
  let daOutra = '', dela = ''
  await como(browser, recepcao!, async p => {
    daOutra = await agendar(p, 'Luíza', rede!.professionalId, '10:00')
    dela    = await agendar(p, 'Helena', propria!.userId, '11:00')
  })

  // O aviso sai em after(): espera o da gerente, que é o controle.
  await expect.poll(() => avisos(gerente!.userId, daOutra), { message: 'a gerente é avisada' }).toBe(1)
  await expect.poll(() => avisos(gerente!.userId, dela)).toBe(1)
  await expect.poll(() => avisos(rede!.professionalId, daOutra), { message: 'a profissional do agendamento' }).toBe(1)
  await expect.poll(() => avisos(propria!.userId, dela), { message: 'o dela' }).toBe(1)
  await expect.poll(() => avisos(propria!.userId, daOutra), { message: 'o de outra também' }).toBe(1)
  expect(await avisos(recepcao!.userId, daOutra), 'quem agendou não').toBe(0)
})
