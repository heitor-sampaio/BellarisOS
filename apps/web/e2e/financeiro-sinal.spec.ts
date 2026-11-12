import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * As telas do dinheiro escutam um SINAL, não a tabela (F67, a sobra da F63).
 *
 * O Financeiro, o Fechamento do dia, os dashboards e os relatórios assinavam
 * `financial_transactions` pelo Realtime: a linha inteira ia pelo websocket a
 * todo membro da unidade — também a quem o cargo deixa ver só "os meus"
 * lançamentos. Como as comissões (`comissoes_sinais`) e o quadro do CRM, a
 * tela assina "o dinheiro desta rede mudou às X", sem conteúdo, e recarrega
 * pelo servidor, que aplica o alcance.
 *
 * - Um lançamento marca o sinal da rede; o membro o lê pela sessão.
 * - O membro de OUTRA rede não lê o sinal desta.
 *
 * Numa rede [e2e] própria (e uma segunda, a outra rede).
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let outra: OutraRede | null = null
let membro: MembroDeTeste | null = null
let deFora: MembroDeTeste | null = null

const comToken = (token: string): SupabaseClient => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
})

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`fsn${marca}`)
  outra = await criarOutraRede(`fso${marca}`)
  membro = await criarMembro(`fsnm${marca}`, { tenant: rede.tenantId, rotulo: 'Financeiro', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'VIEW', escopo: 'ALL' }] })
  deFora = await criarMembro(`fsof${marca}`, { tenant: outra.tenantId, rotulo: 'Caixa', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await membro?.limpar(); await deFora?.limpar()
  await rede?.limpar(); await outra?.limpar()
})

test('um lançamento marca o sinal do dinheiro da rede, que o membro lê — e o de outra rede, não', async () => {
  const { error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'Serviços', description: 'Sinal', amount: 50,
    is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', created_by: 'e2e',
  })
  expect(error).toBeNull()
  const { data: sinal, error: erroSinal } = await comToken(membro!.accessToken)
    .from('financeiro_sinais').select('tenant_id, mudou_em').eq('tenant_id', rede!.tenantId)
  expect(erroSinal, 'o sinal existe e se lê pela sessão').toBeNull()
  expect((sinal ?? []).length, 'o lançamento marcou o sinal da rede').toBe(1)
  const { data: alheio } = await comToken(deFora!.accessToken).from('financeiro_sinais').select('tenant_id').eq('tenant_id', rede!.tenantId)
  expect(alheio ?? [], 'a outra rede não lê o sinal desta').toEqual([])
})

test('o Financeiro aberto mostra o lançamento novo sozinho, pelo sinal', async ({ browser }) => {
  const { data: b } = await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()
  const ctx = await browser.newContext({ storageState: membro!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${b!.slug}/financeiro`)
    await expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible()
    // O canal ligado (o Postgres respondeu ao postgres_changes) antes de gravar.
    await p.waitForTimeout(3_000)
    const descricao = `Chegou sozinho ${marca}`
    expect((await db().from('financial_transactions').insert({
      branch_id: rede!.branchId, type: 'INCOME', category: 'Serviços', description: descricao, amount: 70,
      is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', created_by: 'e2e',
    })).error).toBeNull()
    await expect(p.getByText(descricao).first(), 'sem recarregar a página').toBeVisible({ timeout: 20_000 })
  } finally {
    await ctx.close()
  }
})
