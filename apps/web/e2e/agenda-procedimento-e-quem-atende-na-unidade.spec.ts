import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * F65 — o agendamento só nasce com o procedimento que a unidade FAZ e com a
 * profissional que ATENDE nela.
 *
 * - D7 da 13ª simulação: a Bambuterapia, da rede e disponível só na Água
 *   Verde, aparecia no agendar do Batel, no Vender, no card, no checkout e no
 *   app — e o núcleo gravava. A regra é a do quadro e do Copilot
 *   (`procedure_branch_availability`).
 * - C10: o núcleo (`conferirPecasDoAgendamento`) não conferia o "Atende
 *   clientes em": pelo id, a agenda gravava a profissional que não atende na
 *   unidade. O encaixe (fora do horário) segue valendo.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let unidadeB = ''
let bambu = ''
let soNaB = ''
let gerente: MembroDeTeste | null = null
const DIA = diaEmQueAUnidadeAbre(20)
let hora = 9

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

function agendar(p: Page, campos: { branchId: string; slug: string; cliente: string; procedimento: string; profissional: string }) {
  const quando = new Date(`${DIA}T${String(hora++).padStart(2, '0')}:00:00-03:00`).toISOString()
  return chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', '/admin/agenda', [undefined], {
    _branchId: campos.branchId, _slug: campos.slug, client_id: campos.cliente, procedure_id: campos.procedimento,
    professional_id: campos.profissional, scheduled_at: quando,
  })
}
const agendamentosDe = async (cliente: string) =>
  ((await db().from('appointments').select('id, branch_id').eq('client_id', cliente)).data ?? []) as { id: string; branch_id: string }[]

test.beforeAll(async () => {
  rede = await criarOutraRede(`pu${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b2, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Água Verde pu${marca}`, slug: `e2e-pu2-${marca}` }).select('id').single<{ id: string }>()
  expect(error, 'a segunda unidade').toBeNull()
  unidadeB = b2!.id
  const { data: pr, error: ePr } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Bambuterapia ${marca}`, category: 'e2e', duration_min: 30, price: 0 })
    .select('id').single<{ id: string }>()
  expect(ePr, 'o procedimento da rede').toBeNull()
  bambu = pr!.id
  expect((await db().from('procedure_branch_availability').insert({ procedure_id: bambu, branch_id: unidadeB })).error, 'só na B').toBeNull()
  // A profissional da rede atende nas duas; a "só na B", só na B.
  expect((await db().from('users').update({ atende_em: [rede.branchId, unidadeB] }).eq('id', rede.professionalId)).error).toBeNull()
  const so = await criarMembro(`pus${marca}`, {
    tenant: rede.tenantId, branchId: unidadeB, rotulo: 'Profissional da B',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }],
  })
  soNaB = so.userId
  expect((await db().from('users').update({ atende_em: [unidadeB] }).eq('id', soNaB)).error).toBeNull()
  gerente = await criarMembro(`pug${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gerente da rede',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').in('branch_id', [rede.branchId, unidadeB].filter(Boolean))).data ?? []).map(a => a.id)
    if (ids.length) await db().from('appointment_history').delete().in('appointment_id', ids)
  }
  await gerente?.limpar(); await rede?.limpar()
})

test('D7: o agendar da unidade lista só o que ela faz — a Bambuterapia aparece na B e não na A', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    await p.goto('/admin/agenda')
    const daA = await chamarAcao(p, 'actions/appointments.ts', 'dadosParaAgendar', '/admin/agenda', [rede!.branchId])
    const daB = await chamarAcao(p, 'actions/appointments.ts', 'dadosParaAgendar', '/admin/agenda', [unidadeB])
    expect(daA.texto, 'a A lista o procedimento dela').toContain(`Proc pu${marca}`)
    expect(daA.texto, 'a A não lista o que ela não faz').not.toContain(`Bambuterapia ${marca}`)
    expect(daB.texto, 'a B lista a Bambuterapia').toContain(`Bambuterapia ${marca}`)
  })
})

test('D7: o núcleo recusa agendar na A o que só a B faz; na B, grava', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Bambu')
  await como(browser, gerente!, async p => {
    const r = await agendar(p, { branchId: rede!.branchId, slug, cliente, procedimento: bambu, profissional: rede!.professionalId })
    expect(r.texto, 'a recusa diz onde não é feito').toContain('não é feito na unidade')
    expect(await agendamentosDe(cliente), 'nada gravado na A').toEqual([])
    const ok = await agendar(p, { branchId: unidadeB, slug: `e2e-pu2-${marca}`, cliente, procedimento: bambu, profissional: rede!.professionalId })
    expect(ok.texto, 'controle').toContain('"success":true')
  })
  expect((await agendamentosDe(cliente)).map(a => a.branch_id), 'gravado na B').toEqual([unidadeB])
})

test('C10: o núcleo recusa a profissional que não atende na unidade; onde ela atende, grava', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Atende')
  await como(browser, gerente!, async p => {
    const r = await agendar(p, { branchId: rede!.branchId, slug, cliente, procedimento: rede!.procedureId, profissional: soNaB })
    expect(r.texto, 'a recusa diz por quê').toContain('não atende nesta unidade')
    expect(await agendamentosDe(cliente), 'nada gravado na A').toEqual([])
    const ok = await agendar(p, { branchId: unidadeB, slug: `e2e-pu2-${marca}`, cliente, procedimento: rede!.procedureId, profissional: soNaB })
    expect(ok.texto, 'controle').toContain('"success":true')
  })
  expect((await agendamentosDe(cliente)).map(a => a.branch_id)).toEqual([unidadeB])
})
