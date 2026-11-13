import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * A8 da 14ª simulação (F71; H8 do levantamento das regras, o Heitor,
 * 2026-11-11: "Respostas rápidas, na verdade, o mais certo seria ser de cada
 * usuário, cada usuário poder configurar as suas").
 *
 * A F69 fez as respostas rápidas de cada pessoa, mas o único caminho para
 * criá-las era o ⚡ (ou a "/") no campo de mensagem de uma conversa ABERTA. Na
 * clínica sem canal ligado o Inbox só dizia "Conectar o WhatsApp", e a dona e
 * a recepção não tinham onde configurar as suas. Agora há um lugar fixo no topo
 * do Inbox, nos dois portais, que lista, cria, edita e apaga as SUAS — o mesmo
 * editor da conversa. Continua pedindo o CRM em Gerenciar (quem guarda é quem
 * manda mensagem, a decisão da F69).
 */

test.setTimeout(150_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let ana: MembroDeTeste
let daUnidade: MembroDeTeste
let soVe: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, rota: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { const p = await ctx.newPage(); await p.goto(rota); await fn(p) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`mqr${marca}`)
  const crm = [{ modulo: 'crm' as const, nivel: 'MANAGE' as const, escopo: 'ALL' as const }]
  ana = await criarMembro(`mqra${marca}`, { tenant: rede.tenantId, rotulo: 'Atendente Ana', permissoes: crm })
  daUnidade = await criarMembro(`mqru${marca}`, { tenant: rede.tenantId, rotulo: 'Recepção', permissoes: crm, branchId: rede.branchId })
  soVe = await criarMembro(`mqrv${marca}`, { tenant: rede.tenantId, rotulo: 'Só vê', permissoes: [{ modulo: 'crm', nivel: 'VIEW', escopo: 'ALL' }] })
})

test.afterAll(async () => {
  await db().from('quick_replies').delete().eq('tenant_id', rede.tenantId)
  await ana?.limpar(); await daUnidade?.limpar(); await soVe?.limpar(); await rede?.limpar()
})

test('A8: sem canal ligado e sem conversa, a pessoa lista, cria, edita e apaga as próprias respostas rápidas', async ({ browser }) => {
  await como(browser, ana, '/admin/inbox', async p => {
    p.on('dialog', d => d.accept())
    await p.getByRole('button', { name: 'Minhas respostas rápidas' }).click()
    const janela = p.getByRole('dialog', { name: 'Minhas respostas rápidas' })
    await expect(janela).toContainText('Nenhuma resposta rápida ainda')

    await janela.getByRole('button', { name: 'Novo' }).click()
    await janela.getByPlaceholder('Preço da limpeza de pele').fill(`Endereço ${marca}`)
    await janela.getByPlaceholder(/A limpeza de pele profunda/).fill('Rua das Flores, 100')
    await janela.getByRole('button', { name: 'Salvar' }).click()
    await expect(janela).toContainText(`Endereço ${marca}`)

    // Fora da conversa, o clique no atalho abre a edição (não há onde inserir).
    await janela.getByRole('button', { name: new RegExp(`Endereço ${marca}`) }).click()
    await janela.getByPlaceholder(/A limpeza de pele profunda/).fill('Rua das Flores, 200')
    await janela.getByRole('button', { name: 'Salvar' }).click()
    await expect(janela).toContainText('Rua das Flores, 200')

    await janela.getByRole('button', { name: 'Apagar' }).click()
    await expect(janela).toContainText('Nenhuma resposta rápida ainda')
  })
  const { data } = await db().from('quick_replies').select('id').eq('tenant_id', rede.tenantId)
  expect(data ?? [], 'apagada de verdade').toHaveLength(0)
})

test('A8: no Inbox da unidade o lugar é o mesmo', async ({ browser }) => {
  await como(browser, daUnidade, `/e2e-un-mqr${marca}/inbox`, async p => {
    await p.getByRole('button', { name: 'Minhas respostas rápidas' }).click()
    const janela = p.getByRole('dialog', { name: 'Minhas respostas rápidas' })
    await janela.getByRole('button', { name: 'Novo' }).click()
    await janela.getByPlaceholder('Preço da limpeza de pele').fill(`Horário ${marca}`)
    await janela.getByPlaceholder(/A limpeza de pele profunda/).fill('Das 9h às 19h')
    await janela.getByRole('button', { name: 'Salvar' }).click()
    await expect(janela).toContainText(`Horário ${marca}`)
  })
  const { data } = await db().from('quick_replies').select('title').eq('tenant_id', rede.tenantId)
  expect((data ?? []).map(r => r.title)).toEqual([`Horário ${marca}`])
})

test('A8: quem só vê o CRM não manda mensagem, e não ganha o botão', async ({ browser }) => {
  await como(browser, soVe, '/admin/inbox', async p => {
    await expect(p.getByPlaceholder('Pesquisar…')).toBeVisible({ timeout: 20_000 })
    await expect(p.getByRole('button', { name: 'Minhas respostas rápidas' })).toHaveCount(0)
  })
})
