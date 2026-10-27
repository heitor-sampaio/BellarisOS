import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Quem abriu o prontuário (2026-10-27, decisões do Heitor).
 *
 * Dado de saúde é sensível na LGPD, e numa investigação a pergunta é "quem
 * viu?". Toda leitura clínica fica registrada em `prontuario_acessos`: a ficha
 * da cliente (com os anexos clínicos), a sessão de atendimento, o plano com a
 * anotação ou a anamnese, e a liberação do prontuário no pacote LGPD (essa,
 * em `lgpd-exportacao.spec.ts`). A mesma pessoa relendo a mesma cliente no
 * mesmo ponto em 30 min é uma linha só. Quem vê o registro é o admin da REDE;
 * ninguém o lê pela sessão nem o altera.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let prof: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let dono: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let nomeDaProf = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`pac${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Acessos')
  const naUnidade = { tenant: rede.tenantId, branchId: rede.branchId }
  prof = await criarMembro(`pap${marca}`, { ...naUnidade, rotulo: 'Profissional', permissoes: [
    { modulo: 'medical_records', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW' },
  ] })
  recepcao = await criarMembro(`par${marca}`, { ...naUnidade, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  gerente = await criarMembro(`pag${marca}`, { ...naUnidade, rotulo: 'Gerente', permissoes: [
    { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' },
  ] })
  dono = await criarMembro(`pad${marca}`, { tenant: rede.tenantId, permissoes: [], donoDaRede: true })
  nomeDaProf = (await db().from('users').select('name').eq('id', prof.userId).single<{ name: string }>()).data!.name
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  if (rede) {
    await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  for (const m of [prof, recepcao, gerente, dono]) await m?.limpar()
  await rede?.limpar()
})

async function como<T>(browser: Browser, m: MembroDeTeste, fazer: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fazer(await ctx.newPage()) } finally { await ctx.close() }
}

const acessos = async (userId?: string) => {
  let q = db().from('prontuario_acessos').select('ponto, user_id, ator_nome, referencia').eq('client_id', cliente)
  if (userId) q = q.eq('user_id', userId)
  const { data, error } = await q
  expect(error, 'ler o registro').toBeNull()
  return data ?? []
}

test('a profissional abre a ficha: o acesso fica registrado, e reabrir em seguida não duplica', async ({ browser }) => {
  await como(browser, prof!, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.getByText(`Acessos pac${marca}`, { exact: false }).first()).toBeVisible()
    await expect.poll(async () => (await acessos(prof!.userId)).length, { message: 'o acesso foi registrado' }).toBe(1)
    await p.reload()
    await expect(p.getByText(`Acessos pac${marca}`, { exact: false }).first()).toBeVisible()
  })
  expect(await acessos(prof!.userId), 'uma linha, com quem e onde').toEqual([
    expect.objectContaining({ ponto: 'ficha', ator_nome: nomeDaProf }),
  ])
})

test('quem não vê o prontuário abre a ficha e nada é registrado', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.getByText(`Acessos pac${marca}`, { exact: false }).first()).toBeVisible()
  })
  expect(await acessos(recepcao!.userId)).toEqual([])
})

test('a sessão de atendimento e o arquivo do tratamento também ficam registrados', async ({ browser }) => {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: prof!.userId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: plano, error: eP } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: prof!.userId, status: 'PROPOSED',
    name: `${PREFIXO} Plano ${marca}`, professional_notes: 'anotação clínica',
  }).select('id').single<{ id: string }>()
  expect(eP).toBeNull()

  await como(browser, prof!, async p => {
    await p.goto(`/${slug}/agenda/${ag!.id}`)
    await expect.poll(async () => (await acessos(prof!.userId)).map(a => a.ponto).sort(), { message: 'a sessão entrou' })
      .toEqual(['ficha', 'sessao'])
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'getTreatmentPlanDetails', `/${slug}/clients/${cliente}`, [plano!.id, cliente])
    expect(r.texto).toContain('anotação clínica')
  })
  await expect.poll(async () => (await acessos(prof!.userId)).find(a => a.ponto === 'plano')?.referencia, { message: 'o plano entrou' })
    .toBe(plano!.id)
})

test('o admin da rede vê quem abriu; o gerente da unidade não', async ({ browser }) => {
  await como(browser, dono!, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=fichas`)
    const secao = p.getByRole('region', { name: 'Acessos ao prontuário' })
    await expect(secao).toBeVisible()
    await expect(secao).toContainText(nomeDaProf)
  })
  await como(browser, gerente!, async p => {
    await p.goto(`/${slug}/clients/${cliente}?aba=fichas`)
    await expect(p.getByText(`Acessos pac${marca}`, { exact: false }).first()).toBeVisible()
    await expect(p.getByRole('region', { name: 'Acessos ao prontuário' })).toHaveCount(0)
  })
})

test('o registro não se lê pela sessão nem se altera', async () => {
  const sessao = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${dono!.accessToken}` } },
  })
  const { data: lido } = await sessao.from('prontuario_acessos').select('id').eq('client_id', cliente)
  expect(lido ?? [], 'nem o admin lê pela chave pública').toEqual([])

  const { error } = await db().from('prontuario_acessos').update({ ator_nome: 'outra pessoa' }).eq('client_id', cliente)
  expect(error, 'nem o servidor altera um acesso registrado').not.toBeNull()
  expect((await acessos()).map(a => a.ator_nome)).not.toContain('outra pessoa')
})
