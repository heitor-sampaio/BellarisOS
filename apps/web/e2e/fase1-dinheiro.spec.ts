import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas, nomeDeTeste } from './apoio/banco'

/**
 * Dinheiro pelo portal da rede: lançar e dar baixa numa pendência.
 *
 * Este arquivo já cobriu abrir e fechar o caixa da unidade. O caixa saiu
 * (2026-09-18): quase nada é recebido em dinheiro vivo, e abrir/fechar todo dia
 * era cerimônia para conferir uma gaveta que não existe. O que sobrou é o que
 * importa de verdade — a rede lança e recebe em nome de uma unidade, e o
 * lançamento nasce na unidade certa.
 *
 * Estorno e crédito interno ficam de fora de propósito: os dois geram
 * contrapartida permanente (contra-transação e saldo do cliente), e um teste
 * que roda toda hora não deve deixar esse rastro no banco de desenvolvimento.
 */

const descricaoPaga     = nomeDeTeste('receita paga')
const descricaoPendente = nomeDeTeste('receita pendente')

const criadas: string[] = []

test.afterAll(async () => {
  const db = banco()
  for (const id of criadas) await db.from('financial_transactions').delete().eq('id', id)
})

test('lançar receita na unidade escolhida e dar baixa — tudo pelo /admin', async ({ page }) => {
  const db = banco()
  const unidades = await filiaisAtivas()
  const unidade  = unidades[0]!

  // -- Receita já paga --------------------------------------------------------
  await page.goto('/admin/financeiro')
  await page.getByRole('button', { name: 'Novo lançamento' }).click()
  let dialogo = page.locator('dialog[open]')
  await dialogo.locator('select').first().selectOption({ label: unidade.name })
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
  // A unidade vem do formulário: sem ela o lançamento da rede não teria filial.
  expect(paga.branch_id).toBe(unidade.id)
  expect(paga.paid_at).not.toBeNull()

  // -- Pendente, e depois paga pela própria tela da rede ----------------------
  await page.goto('/admin/financeiro')
  await page.getByRole('button', { name: 'Novo lançamento' }).click()
  dialogo = page.locator('dialog[open]')
  await dialogo.locator('select').first().selectOption({ label: unidade.name })
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
})

async function esperarTransacao(descricao: string) {
  const db = banco()
  let achada: any = null
  await expect.poll(async () => {
    const { data } = await db
      .from('financial_transactions')
      .select('id, is_paid, paid_at, branch_id')
      .eq('description', descricao)
      .maybeSingle()
    achada = data
    return data?.id ?? null
  }, { message: `a transação "${descricao}" deveria ter sido gravada` }).not.toBeNull()
  return achada as { id: string; is_paid: boolean; paid_at: string | null; branch_id: string }
}
