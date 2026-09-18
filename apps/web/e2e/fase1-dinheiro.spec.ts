import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas, nomeDeTeste } from './apoio/banco'

/**
 * Dinheiro pelo portal da rede: caixa, lançamento e baixa de pendência.
 *
 * O que se guarda aqui é o efeito invisível: todo recebimento carimba
 * `financial_transactions.cash_register_id` com o caixa aberto da unidade, e
 * era isso que se perdia quando a rede recebia sem ter como abrir o caixa —
 * o valor entrava e ficava fora de qualquer fechamento.
 *
 * Estorno e crédito interno ficam de fora de propósito: os dois geram
 * contrapartida permanente (contra-transação e saldo do cliente), e um teste
 * que roda toda hora não deve deixar esse rastro no banco de desenvolvimento.
 */

const descricaoPaga     = nomeDeTeste('receita paga')
const descricaoPendente = nomeDeTeste('receita pendente')

let registerId:  string | null = null
let criadas:     string[] = []

test.afterAll(async () => {
  const db = banco()
  for (const id of criadas) await db.from('financial_transactions').delete().eq('id', id)
  if (registerId) await db.from('cash_registers').delete().eq('id', registerId)
})

test('caixa da unidade, lançamento e baixa — tudo pelo /admin', async ({ page }) => {
  const db = banco()
  const unidades = await filiaisAtivas()

  const { data: abertos, error } = await db
    .from('cash_registers').select('branch_id').is('closed_at', null)
  expect(error, 'consulta de caixas abertos falhou').toBeNull()

  const comCaixaAberto = new Set((abertos ?? []).map(r => r.branch_id as string))
  const unidade = unidades.find(u => !comCaixaAberto.has(u.id))
  test.skip(!unidade, 'todas as unidades já têm caixa aberto — o teste abriria um segundo')

  await page.goto('/admin/financeiro')

  // -- Abrir o caixa da unidade, sem sair do portal da rede ------------------
  await expect(page.getByRole('heading', { name: 'Caixa das unidades' })).toBeVisible()
  const linha = page.locator('.card').filter({ hasText: `${unidade!.name} · Caixa fechado` }).first()
  await linha.getByRole('button', { name: 'Abrir caixa' }).click()

  const dialogoAbrir = page.locator('dialog[open]')
  await dialogoAbrir.locator('input[name="opening_balance"]').fill('50')
  await dialogoAbrir.getByRole('button', { name: 'Abrir caixa' }).click()

  await expect.poll(async () => {
    const { data } = await db.from('cash_registers')
      .select('id').eq('branch_id', unidade!.id).is('closed_at', null).maybeSingle()
    registerId = (data?.id as string) ?? null
    return registerId
  }, { message: 'abrir caixa deveria criar um registro aberto' }).not.toBeNull()

  // -- Receita paga: o carimbo do caixa é o ponto -----------------------------
  await page.goto('/admin/financeiro')
  await page.getByRole('button', { name: 'Novo lançamento' }).click()
  let dialogo = page.locator('dialog[open]')
  await dialogo.locator('select').first().selectOption({ label: unidade!.name })
  await dialogo.getByRole('button', { name: 'Receita' }).click()
  await dialogo.locator('input[name="description"]').fill(descricaoPaga)
  await dialogo.locator('select[name="category"]').selectOption({ index: 1 })
  await dialogo.getByPlaceholder('0,00').first().fill('10')
  await dialogo.getByRole('button', { name: 'Pago', exact: true }).click()
  await dialogo.getByRole('button', { name: 'Lançar' }).click()
  await expect(dialogo).toBeHidden()

  const paga = await esperarTransacao(descricaoPaga)
  criadas.push(paga.id)
  expect(paga.is_paid).toBe(true)
  expect(paga.branch_id).toBe(unidade!.id)
  expect(paga.cash_register_id, 'o recebimento tem de entrar no caixa aberto da unidade').toBe(registerId)

  // -- Pendente e depois paga pela própria tela da rede ----------------------
  await page.goto('/admin/financeiro')
  await page.getByRole('button', { name: 'Novo lançamento' }).click()
  dialogo = page.locator('dialog[open]')
  await dialogo.locator('select').first().selectOption({ label: unidade!.name })
  await dialogo.getByRole('button', { name: 'Receita' }).click()
  await dialogo.locator('input[name="description"]').fill(descricaoPendente)
  await dialogo.locator('select[name="category"]').selectOption({ index: 1 })
  await dialogo.getByPlaceholder('0,00').first().fill('20')
  await dialogo.getByRole('button', { name: 'Pendente' }).click()
  await dialogo.getByRole('button', { name: 'Lançar' }).click()
  await expect(dialogo).toBeHidden()

  const pendente = await esperarTransacao(descricaoPendente)
  criadas.push(pendente.id)
  expect(pendente.is_paid).toBe(false)

  await page.goto('/admin/financeiro')
  const linhaPendente = page.locator('tr').filter({ hasText: descricaoPendente }).first()
  await expect(linhaPendente).toBeVisible()
  await linhaPendente.getByTitle('Marcar como pago').click()

  await expect.poll(async () => {
    const { data } = await db.from('financial_transactions')
      .select('is_paid, paid_at').eq('id', pendente.id).single()
    return Boolean(data?.is_paid && data?.paid_at)
  }, { message: 'marcar pago deveria gravar is_paid e paid_at' }).toBe(true)

  // -- Fechar o caixa, devolvendo a unidade ao estado em que estava ----------
  await page.goto('/admin/financeiro')
  await page.locator('.card').filter({ hasText: `${unidade!.name} · Caixa aberto` }).first()
    .getByRole('button', { name: 'Fechar caixa' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Confirmar fechamento' }).click()

  await expect.poll(async () => {
    const { data } = await db.from('cash_registers').select('closed_at').eq('id', registerId!).single()
    return data?.closed_at !== null
  }, { message: 'fechar caixa deveria carimbar closed_at' }).toBe(true)
})

async function esperarTransacao(descricao: string) {
  const db = banco()
  let achada: any = null
  await expect.poll(async () => {
    const { data } = await db
      .from('financial_transactions')
      .select('id, is_paid, branch_id, cash_register_id')
      .eq('description', descricao)
      .maybeSingle()
    achada = data
    return data?.id ?? null
  }, { message: `a transação "${descricao}" deveria ter sido gravada` }).not.toBeNull()
  return achada as { id: string; is_paid: boolean; branch_id: string; cash_register_id: string | null }
}
