import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * F73 — a sobra da F69 (C57a): numa rede cujo plano NÃO tem o portal do
 * cliente, o anexo da ficha seguia com "Enviar à cliente" — e a action recusa
 * ("O plano desta clínica não tem o portal do cliente"). Botão que a pessoa
 * não pode usar (CLAUDE.md §14): a tela esconde. A prova da action é a da F69.
 */

test.setTimeout(150_000)

const marca = `ds${Date.now().toString(36)}`
const db = () => banco()
const ANEXO = `${PREFIXO} Comprovante ${marca}`
let rede: OutraRede
let gestor: MembroDeTeste
let cliente = ''
let plano = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  // O plano da rede: tudo, MENOS o portal — antes de qualquer sessão abrir.
  const { data: p, error: eP } = await db().from('platform_plans').insert({ nome: `${PREFIXO} Plano sem portal ${marca}`, valor_centavos: 0 }).select('id').single<{ id: string }>()
  expect(eP).toBeNull()
  plano = p!.id
  const { error: eS } = await db().from('tenant_subscriptions').upsert({
    tenant_id: rede.tenantId, plan_id: plano, valor_centavos: 0,
    recursos: { funcionalidades: FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'portal'), limites: { unidades: null, membros: null, whatsapp: null } },
  }, { onConflict: 'tenant_id' })
  expect(eS, eS?.message).toBeNull()
  gestor = await criarMembro(`g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção sem portal',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Ana')
  expect((await db().from('client_documents').insert({
    client_id: cliente, branch_id: rede.branchId, name: ANEXO, category: 'outro',
    file_path: `${rede.branchId}/${cliente}/inexistente.txt`, file_name: 'comprovante.txt', file_size: 3, mime_type: 'text/plain',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await db().from('client_documents').delete().eq('client_id', cliente)
  await db().from('tenant_subscriptions').delete().eq('tenant_id', rede.tenantId)
  await gestor?.limpar(); await rede?.limpar()
  if (plano) await db().from('platform_plans').delete().eq('id', plano)
})

test('sem o portal no plano, o anexo não oferece "Enviar à cliente"', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=documentos`)
    await expect(p.getByText(ANEXO)).toBeVisible({ timeout: 20_000 })
    await expect(p.getByText('Só a equipe vê').first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Enviar à cliente' })).toHaveCount(0)
  })
})
