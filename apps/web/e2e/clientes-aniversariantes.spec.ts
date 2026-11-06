import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A9 da 8ª simulação (2026-11-06): não havia tela nem filtro de
 * aniversariantes do mês — só a automação desligada, e as datas estavam certas
 * no banco. A lista de Clientes ganhou, na "Situação", "Aniversariantes de
 * <mês>": quem faz aniversário no mês de Brasília, decidido PELO BANCO
 * (`clientes_aniversariantes`; §14 do CLAUDE.md — nada de filtrar no app
 * depois de ler um lote), com o dia na linha e em ordem de dia.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let recepcao: MembroDeTeste
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesAtual = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).split('-')[1])
const mm = String(mesAtual).padStart(2, '0')
const outroMes = String((mesAtual % 12) + 1).padStart(2, '0')

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`ani${marca}`)
  recepcao = await criarMembro(`anir${marca}`, { tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }] })
  const linhas = [
    { nome: 'Aniversariante 20', nascimento: `1990-${mm}-20` },
    { nome: 'Aniversariante 05', nascimento: `1985-${mm}-05` },
    { nome: 'Outro mês', nascimento: `1992-${outroMes}-10` },
    { nome: 'Sem nascimento', nascimento: null },
  ]
  for (const [i, l] of linhas.entries()) {
    const { error } = await db().from('clients').insert({
      tenant_id: rede.tenantId, branch_id: rede.branchId, name: `${PREFIXO} ${l.nome} ${marca}`,
      phone: `55489${String(Date.now()).slice(-7)}${i}`.slice(0, 13), birth_date: l.nascimento, is_active: true,
    })
    expect(error).toBeNull()
  }
})
test.afterAll(async () => {
  await recepcao?.limpar()
  await rede?.limpar()
})

test('A9: "Aniversariantes do mês" na lista de Clientes, pelo banco, com o dia', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ storageState: recepcao.estado })
  const p = await ctx.newPage()
  try {
    await p.goto('/admin/clients')
    await expect(p.getByText(`${PREFIXO} Outro mês ${marca}`)).toBeVisible({ timeout: 15_000 })
    await p.getByRole('button', { name: 'Situação' }).click()
    await p.locator('[data-painel-picker]').getByText(`Aniversariantes de ${MESES[mesAtual - 1]}`).click()
    const lista = p.locator('.clients-master-list')
    await expect(lista.getByText(`${PREFIXO} Aniversariante 05 ${marca}`)).toBeVisible()
    await expect(lista.getByText(`${PREFIXO} Aniversariante 20 ${marca}`)).toBeVisible()
    await expect(lista.getByText(`${PREFIXO} Outro mês ${marca}`)).toHaveCount(0)
    await expect(lista.getByText(`${PREFIXO} Sem nascimento ${marca}`)).toHaveCount(0)
    // O dia na linha, e a ordem é a do dia.
    await expect(lista.locator('[data-aniversario]').first()).toHaveText(`Aniversário dia 05/${mm}`)
    await expect(lista.locator('[data-aniversario]').nth(1)).toHaveText(`Aniversário dia 20/${mm}`)
  } finally { await ctx.close() }
})
