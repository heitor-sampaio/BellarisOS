import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A17 da 5ª simulação (2026-11-01): "num clique, a aba Oportunidades da ficha
 * mostrou o quadro geral; pela URL ?aba=oportunidades abre a lista certa".
 * A ficha tinha DOIS links chamados "Oportunidades" — o do menu lateral (que
 * desde o A2 é link de verdade, para o quadro geral) e o da barra de abas — e
 * nada os distinguia para quem procura pelo nome (o leitor de tela, o robô da
 * simulação). As abas da ficha são abas (`tablist` / `tab`, com a escolhida
 * marcada); o clique na aba abre a lista da cliente, não o quadro.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let clienteId = ''
let leadId = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`ao${marca}`)
  recepcao = await criarMembro(`ao${marca}`, {
    tenant: rede.tenantId, rotulo: 'Comercial',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  clienteId = await rede.criarCliente('Aba de oportunidades')
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Negócio da aba ${marca}`, phone: '5548' + String(Date.now()).slice(-9), client_id: clienteId,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  leadId = data!.id
})

test.afterAll(async () => {
  if (leadId) { await db().from('lead_events').delete().eq('lead_id', leadId); await db().from('leads').delete().eq('id', leadId) }
  await recepcao?.limpar()
  await rede?.limpar()
})

test('A17: a aba Oportunidades da ficha é uma aba — o clique abre a lista da cliente, não o quadro', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${clienteId}`)
    const abas = p.getByRole('tablist', { name: 'Abas da ficha' })
    await expect(abas.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true')
    await abas.getByRole('tab', { name: 'Oportunidades' }).click()
    await expect(p).toHaveURL(new RegExp(`/admin/clients/${clienteId}\\?aba=oportunidades`))
    await expect(p.getByText('Negociações')).toBeVisible()
    await expect(p.getByText('1 em aberto · 1 no total')).toBeVisible()
    await expect(abas.getByRole('tab', { name: 'Oportunidades' })).toHaveAttribute('aria-selected', 'true')
  } finally { await ctx.close() }
})
