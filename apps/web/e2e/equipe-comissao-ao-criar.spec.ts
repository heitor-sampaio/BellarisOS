import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Criar um membro que atende oferece, ali, a comissão (A10, simulação de
 * 2026-10-27): antes só aparecia "Sem comissão" na lista, e a dona precisava
 * adivinhar o chip. A regra do profissional é o PADRÃO dele (percentual);
 * as exceções por procedimento seguem no chip da Equipe.
 */
const marca = Date.now().toString(36)
let rede: OutraRede
let gestor: MembroDeTeste
let semFinanceiro: MembroDeTeste
const emails = [`e2e-ana-${marca}@bellaris.invalid`, `e2e-bia-${marca}@bellaris.invalid`]

test.beforeAll(async () => {
  rede = await criarOutraRede(`ec${marca}`)
  gestor = await criarMembro(`ecg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor',
    permissoes: [{ modulo: 'team', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }],
  })
  semFinanceiro = await criarMembro(`ecs${marca}`, {
    tenant: rede.tenantId, rotulo: 'So equipe', permissoes: [{ modulo: 'team', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const db = banco()
  for (const email of emails) {
    const { data: u } = await db.from('users').select('id, auth_id').eq('email', email).maybeSingle<{ id: string; auth_id: string | null }>()
    if (!u) continue
    await db.from('commission_rules').delete().eq('professional_id', u.id)
    await db.from('domain_events').delete().eq('entidade_id', u.id)
    await db.from('users').delete().eq('id', u.id)
    if (u.auth_id) await db.auth.admin.deleteUser(u.auth_id)
  }
  await gestor?.limpar(); await semFinanceiro?.limpar(); await rede?.limpar()
})

async function criar(browser: import('@playwright/test').Browser, quem: MembroDeTeste, email: string, comissao: string | null) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/team')
    await p.getByRole('button', { name: 'Adicionar membro' }).click()
    const modal = p.locator('dialog[open], [role="dialog"]').last()
    await modal.locator('#tm-name').fill(`[e2e] ${email.split('@')[0]}`)
    await modal.locator('#tm-email').fill(email)
    await modal.locator('#tm-role').selectOption({ index: 1 })
    await modal.locator('#tm-branch').selectOption({ index: 1 })
    await modal.locator('#tm-password').fill('Senha-e2e-123')
    const campo = modal.getByLabel(/Comissão padrão/)
    await expect(campo, 'sem "atende", não pergunta').toHaveCount(0)
    await modal.getByLabel(/Atende clientes/).check()
    if (comissao !== null) {
      await campo.fill(comissao)
    } else {
      await expect(campo, 'quem não gere o financeiro não vê a comissão').toHaveCount(0)
    }
    await modal.getByRole('button', { name: 'Criar membro' }).click()
    await expect.poll(async () => (await banco().from('users').select('id').eq('email', email)).data?.length ?? 0).toBe(1)
  } finally { await ctx.close() }
}

test('quem gere o financeiro define o percentual padrão já ao criar quem atende', async ({ browser }) => {
  await criar(browser, gestor, emails[0]!, '30')
  const { data: u } = await banco().from('users').select('id').eq('email', emails[0]!).single<{ id: string }>()
  await expect.poll(async () => (await banco().from('commission_rules').select('procedure_id, type, value').eq('professional_id', u!.id)).data)
    .toEqual([{ procedure_id: null, type: 'PERCENTAGE', value: 30 }])
})

test('quem só gere a equipe não vê nem grava comissão', async ({ browser }) => {
  await criar(browser, semFinanceiro, emails[1]!, null)
  const { data: u } = await banco().from('users').select('id').eq('email', emails[1]!).single<{ id: string }>()
  expect((await banco().from('commission_rules').select('id').eq('professional_id', u!.id)).data).toEqual([])
})
