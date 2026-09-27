import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas, nomeDeTeste, tenantId, PREFIXO } from './apoio/banco'
import { capturarAcao, reenviarAcao } from './apoio/acao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * Uma rede não grava na outra pelo id — lançamento, estoque e crédito interno.
 *
 * Achado na varredura de cobertura de 2026-09-27: estas actions recebiam do
 * formulário a unidade, o produto ou o cliente e gravavam SEM conferir de que
 * rede eram. Nenhuma tela oferece o id de outra rede, então o furo só aparece
 * fazendo o que o atacante faria (`apoio/acao.ts`): a chamada legítima pela
 * tela, reenviada com o id trocado.
 *
 * Em cada caso, o controle é a chamada legítima ter gravado — sem ele, "não
 * gravou na outra rede" poderia ser só um reenvio que não funciona.
 */

const marca = Date.now().toString(36)

test.describe.serial('ações de dinheiro e estoque entre redes', () => {
  let outra: OutraRede | null = null
  test.beforeAll(async () => { outra = await criarOutraRede(`acoes${marca}`) })
  test.afterAll(async () => { await outra?.limpar() })

  test('lançamento: não cai na unidade de outra rede', async ({ page }) => {
    const db = banco()
    const unidade = (await filiaisAtivas())[0]!
    const legitimo = nomeDeTeste('lanc legitimo')
    const invasor  = nomeDeTeste('lanc invasor')

    try {
      await page.goto('/admin/financeiro')
      await page.getByRole('button', { name: 'Novo lançamento' }).click()
      const dialogo = page.locator('dialog[open]').filter({ hasText: 'Novo lançamento' })
      await dialogo.locator('select').first().selectOption({ label: unidade.name })
      await dialogo.getByRole('button', { name: 'Receita' }).click()
      await dialogo.locator('input[name="description"]').fill(legitimo)
      await dialogo.locator('select[name="category"]').selectOption({ index: 1 })
      await dialogo.getByPlaceholder('0,00').first().fill('10')
      await dialogo.getByRole('button', { name: 'Pendente' }).click()

      const chamada = capturarAcao(page, corpo => corpo.includes(legitimo))
      await dialogo.getByRole('button', { name: 'Lançar' }).click()
      const req = await chamada

      await expect.poll(async () => {
        const { data } = await db.from('financial_transactions').select('id').eq('description', legitimo)
        return data?.length ?? 0
      }, { message: 'o controle: o lançamento legítimo gravou' }).toBe(1)

      await reenviarAcao(page, req, [[unidade.id, outra!.branchId], [legitimo, invasor]])

      const { data: plantado } = await db.from('financial_transactions').select('id').eq('description', invasor)
      expect(plantado ?? [], 'lançamento na unidade de outra rede').toHaveLength(0)
    } finally {
      await db.from('financial_transactions').delete().in('description', [legitimo, invasor])
    }
  })

  test('estoque: entrada não mexe em produto nem unidade de outra rede', async ({ page }) => {
    const db = banco()
    const unidade = (await filiaisAtivas())[0]!
    const nome = nomeDeTeste('Produto acoes')
    const alheio = await outra!.criarProduto('Produto alheio', 10)
    let meu: string | null = null

    try {
      // O produto da própria rede nasce pela tela, como no fase3-estoque.
      await page.goto('/admin/estoque')
      await page.getByRole('button', { name: 'Novo produto' }).click()
      const novo = page.locator('dialog[open]')
      await novo.locator('input[name="name"]').fill(nome)
      await novo.getByRole('button', { name: 'Criar produto' }).click()
      await expect(novo).toBeHidden()
      await expect.poll(async () => {
        const { data } = await db.from('products').select('id').eq('name', nome).maybeSingle()
        meu = (data?.id as string) ?? null
        return meu
      }).not.toBeNull()

      await page.goto('/admin/estoque')
      await page.locator('tr, [role="row"], div').filter({ hasText: nome })
        .filter({ has: page.getByTitle('Gerenciar estoque') }).last()
        .getByTitle('Gerenciar estoque').click()
      const modal = page.locator('dialog[open]')
      await modal.locator('select[name="branchId"]').first().selectOption(unidade.id)
      await modal.locator('input[name="quantity"]').first().fill('2')

      const chamada = capturarAcao(page, corpo => corpo.includes(meu!))
      await modal.getByRole('button', { name: 'Registrar entrada' }).click()
      const req = await chamada

      await expect.poll(async () => {
        const { data } = await db.from('stock_movements').select('id').eq('product_id', meu!)
        return data?.length ?? 0
      }, { message: 'o controle: a entrada legítima gravou' }).toBe(1)

      await reenviarAcao(page, req, [[meu!, alheio], [unidade.id, outra!.branchId]])

      const { data: movs } = await db.from('stock_movements').select('id').eq('product_id', alheio)
      expect(movs ?? [], 'movimento no produto de outra rede').toHaveLength(0)
      const { data: saldo } = await db.from('branch_product_stock').select('current_stock')
        .eq('product_id', alheio).eq('branch_id', outra!.branchId).single()
      expect(Number(saldo!.current_stock), 'o saldo da outra rede não pode mudar').toBe(10)
    } finally {
      if (meu) {
        await db.from('product_batches').delete().eq('product_id', meu)
        await db.from('stock_movements').delete().eq('product_id', meu)
        await db.from('branch_product_stock').delete().eq('product_id', meu)
        await db.from('domain_events').delete().eq('entidade_id', meu)
        await db.from('products').delete().eq('id', meu)
      }
    }
  })

  test('crédito interno: não vai para cliente de outra rede', async ({ page }) => {
    const db = banco()
    const unidade = (await filiaisAtivas())[0]!
    const alheio = await outra!.criarCliente('Cliente alheio')
    const { data: cli, error } = await db.from('clients')
      .insert({ tenant_id: await tenantId(), branch_id: unidade.id, name: `${PREFIXO} Cliente credito ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
      .select('id').single<{ id: string }>()
    expect(error).toBeNull()
    await db.from('loyalty_accounts').upsert({ client_id: cli!.id }, { onConflict: 'client_id' })

    try {
      await page.goto(`/admin/clients/${cli!.id}?aba=financeiro`)
      await page.getByRole('button', { name: /Conceder crédito/ }).first().click()
      const form = page.locator('form').filter({ has: page.locator('input[name="amount"]') })
      await form.locator('input[name="amount"]').fill('15')
      await form.locator('input[name="description"]').fill(`${PREFIXO} credito legitimo`)

      const chamada = capturarAcao(page, corpo => corpo.includes(cli!.id))
      await form.getByRole('button', { name: 'Conceder crédito' }).click()
      const req = await chamada

      await expect.poll(async () => {
        const { data } = await db.from('internal_credits').select('id').eq('client_id', cli!.id)
        return data?.length ?? 0
      }, { message: 'o controle: o crédito legítimo gravou' }).toBe(1)

      await reenviarAcao(page, req, [[cli!.id, alheio]])

      const { data: plantado } = await db.from('internal_credits').select('id').eq('client_id', alheio)
      expect(plantado ?? [], 'crédito para cliente de outra rede').toHaveLength(0)
    } finally {
      await apagarClientes([cli!.id])
    }
  })
})
