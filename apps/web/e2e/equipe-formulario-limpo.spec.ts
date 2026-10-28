import { test, expect, type Page } from '@playwright/test'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D8 da simulação de 2026-10-28 (regressão de 4e5bef5): "Adicionar membro"
 * herdava "Atende clientes" e a abrangência do cadastro anterior — o estado
 * vivia fora do modal e não era zerado ao fechar. O Marcos (Financeiro) nasceu
 * profissional. O formulário nasce LIMPO a cada abertura; na edição, nasce com
 * os valores do membro editado.
 */
const marca = Date.now().toString(36)
let rede: OutraRede
let gestor: MembroDeTeste

test.beforeAll(async () => {
  rede = await criarOutraRede(`ef${marca}`)
  gestor = await criarMembro(`efg${marca}`, { tenant: rede.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'team', nivel: 'MANAGE' }] })
})
test.afterAll(async () => { await gestor?.limpar(); await rede?.limpar() })

const modal = (p: Page) => p.locator('dialog[open], [role="dialog"]').last()

test('Adicionar membro: abrir, marcar, fechar e abrir de novo volta limpo', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gestor.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/team')
    await p.getByRole('button', { name: 'Adicionar membro' }).click()
    await expect(modal(p).locator('#tm-branch'), 'nasce em "Uma filial"').toBeVisible()
    await expect(modal(p).getByLabel(/Atende clientes/)).not.toBeChecked()
    await modal(p).getByLabel(/Atende clientes/).check()
    await modal(p).getByText('Rede inteira', { exact: true }).click()
    await expect(modal(p).locator('#tm-branch')).toHaveCount(0)
    await modal(p).getByRole('button', { name: 'Cancelar' }).click()
    await expect(p.locator('dialog[open]')).toHaveCount(0)

    await p.getByRole('button', { name: 'Adicionar membro' }).click()
    await expect.soft(modal(p).getByLabel(/Atende clientes/), 'o "atende" do cadastro anterior não vem junto').not.toBeChecked()
    await expect(modal(p).locator('#tm-branch'), 'nem a abrangência do anterior').toBeVisible()
  } finally { await ctx.close() }
})

test('Editar membro: reabrir depois de mexer e cancelar mostra os valores do membro', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gestor.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/team')
    const editar = p.getByTitle(/^Editar /).first()
    await editar.click()
    const emRede = await modal(p).getByText('Acesso a todas as unidades, sem filial fixa.').isVisible()
    const atendia = await modal(p).getByLabel(/Atende clientes/).isChecked()
    await modal(p).getByText(emRede ? 'Uma filial' : 'Rede inteira', { exact: true }).click()
    await modal(p).getByLabel(/Atende clientes/).setChecked(!atendia)
    await modal(p).getByRole('button', { name: 'Cancelar' }).click()
    await expect(p.locator('dialog[open]')).toHaveCount(0)

    await editar.click()
    await expect.soft(modal(p).getByText('Acesso a todas as unidades, sem filial fixa.'), 'a abrangência é a do membro').toHaveCount(emRede ? 1 : 0)
    expect.soft(await modal(p).getByLabel(/Atende clientes/).isChecked(), 'o "atende" é o do membro').toBe(atendia)
  } finally { await ctx.close() }
})
