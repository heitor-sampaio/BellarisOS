import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os lançamentos (`financial_transactions`) pela chave pública — a sobra da
 * F63 ("a sessão só LÊ o que o cargo vê", C1 do levantamento das regras;
 * CLAUDE.md §4). A política "Operacional acessa financeiro da filial" era ALL
 * para todo membro da unidade, sem o módulo: a profissional sem o Financeiro
 * lia o caixa da unidade inteira pelo PostgREST, e QUALQUER membro gravava um
 * recebimento falso (sem WITH CHECK do módulo, sem a trava da action).
 *
 * Desde a F75 a sessão não lê nem grava lançamento nenhum: a tela do
 * Financeiro lê pelo servidor, depois de `assertPermission` e do alcance —
 * como as comissões. A prova fala com o banco COM O TOKEN de cada membro
 * (teste com service_role não prova RLS nenhuma); o controle é a tela, que
 * continua mostrando o lançamento a quem tem o Financeiro.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const db = () => banco()
const comToken = (t: string): SupabaseClient =>
  createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${t}` } } })

let rede: OutraRede | null = null
let slug = ''
let lancamento = ''
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let gestor: MembroDeTeste | null = null

test.beforeAll(async () => {
  test.setTimeout(200_000)
  rede = await criarOutraRede(`f75rls${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, type: 'INCOME', category: 'Atendimento', description: `Caixa da unidade ${marca}`,
    amount: 321, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  lancamento = data!.id
  profissional = await criarMembro(`f75rp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }],
  })
  recepcao = await criarMembro(`f75rr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
  gestor = await criarMembro(`f75rg${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gestora', permissoes: [{ modulo: 'financial', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await db().from('financial_transactions').delete().eq('branch_id', rede?.branchId ?? '').like('description', `%${marca}%`)
  await profissional?.limpar(); await recepcao?.limpar(); await gestor?.limpar(); await rede?.limpar()
})

test('a sessão não lê os lançamentos da unidade — nem quem não tem o Financeiro, nem quem tem', async () => {
  for (const m of [profissional!, recepcao!, gestor!]) {
    const { data, error } = await comToken(m.accessToken).from('financial_transactions').select('id, amount').eq('id', lancamento)
    expect(error, 'a leitura não estoura: só não traz nada').toBeNull()
    expect(data ?? [], 'o lançamento não vem pela sessão').toEqual([])
  }
})

test('a sessão não grava lançamento: o recebimento falso pela chave pública é recusado', async () => {
  for (const m of [profissional!, recepcao!]) {
    const falso = `Recebimento falso ${m.userId.slice(0, 6)} ${marca}`
    await comToken(m.accessToken).from('financial_transactions').insert({
      branch_id: rede!.branchId, type: 'INCOME', category: 'Atendimento', description: falso,
      amount: 999, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'CASH', created_by: 'sessao',
    })
    const { data } = await db().from('financial_transactions').select('id').eq('description', falso)
    expect(data ?? [], 'nada gravado').toEqual([])
    // E não altera o que existe.
    await comToken(m.accessToken).from('financial_transactions').update({ amount: 1 }).eq('id', lancamento)
    const { data: o } = await db().from('financial_transactions').select('amount').eq('id', lancamento).single<{ amount: number }>()
    expect(Number(o!.amount)).toBe(321)
  }
})

test('o controle: a tela do Financeiro continua mostrando o lançamento a quem tem o módulo (lido pelo servidor)', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p: Page = await ctx.newPage()
    await p.goto(`/${slug}/financeiro`)
    await expect(p.getByText(`Caixa da unidade ${marca}`).first()).toBeVisible({ timeout: 30_000 })
  } finally { await ctx.close() }
})
