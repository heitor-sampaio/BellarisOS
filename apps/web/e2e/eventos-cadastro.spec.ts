import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste } from './apoio/banco'

/**
 * Fase 5 pela tela: criar procedimento e mexer no preço.
 *
 * O que este teste guarda não é "o evento sai" — é **o evento NÃO sair quando
 * nada mudou**. Aquela tela é usada para corrigir descrição, trocar a ficha
 * vinculada e ajustar insumos, e emitir `preco_alterado` em toda salvada faria
 * a automação de preço disparar sem preço nenhum ter mudado. Esse caso é mudo:
 * não quebra tela, não aparece em log, só polui a corrente.
 */
const nome  = nomeDeTeste('Procedimento')
const PRECO = '300,00'
const NOVO  = '450,00'

let procedureId: string | null = null

test.afterAll(async () => {
  const db = banco()
  if (!procedureId) return
  await db.from('domain_events').delete().eq('entidade_id', procedureId)
  await db.from('procedure_price_history').delete().eq('procedure_id', procedureId)
  await db.from('procedure_branch_availability').delete().eq('procedure_id', procedureId)
  await db.from('procedures').delete().eq('id', procedureId)
})

/**
 * Abre a edição pelo botão da LINHA do procedimento.
 *
 * Clicar no nome não abre nada: o gatilho é o "Editar" da linha, e cada linha
 * tem o seu — por isso o filtro por `hasText` antes.
 */
async function abrirEdicao(page: import('@playwright/test').Page) {
  await page.goto('/admin/procedures')
  const linha = page.locator('tr', { hasText: nome })
  await linha.getByRole('button', { name: 'Editar' }).click()
  await expect(page.locator('dialog[open]')).toBeVisible()
}

async function eventos(nomeDoEvento: string) {
  const db = banco()
  const { data } = await db
    .from('domain_events')
    .select('nome, dados, ator_tipo, origem')
    .eq('entidade_id', procedureId!)
    .eq('nome', nomeDoEvento)
  return data ?? []
}

test('procedimento criado e preço alterado viram eventos — salvar sem mexer, não', async ({ page }) => {
  const db = banco()

  // -- Criar -----------------------------------------------------------------
  await page.goto('/admin/procedures')
  await page.getByRole('button', { name: 'Novo procedimento' }).click()

  const dialogo = page.locator('dialog[open]')
  await dialogo.locator('input[name="name"]').fill(nome)
  await dialogo.locator('select[name="category"]').selectOption('Outros')
  await dialogo.locator('input[name="duration_min"]').fill('45')
  await dialogo.locator('input[name="price"]').fill(PRECO)
  await dialogo.getByRole('button', { name: 'Criar procedimento' }).click()
  await expect(dialogo).toBeHidden()

  await expect.poll(async () => {
    const { data } = await db.from('procedures').select('id').eq('name', nome).maybeSingle()
    procedureId = (data?.id as string) ?? null
    return procedureId
  }, { message: 'o procedimento deveria ter sido criado' }).not.toBeNull()

  await expect.poll(() => eventos('procedimento.criado').then(e => e.length),
    { message: 'criar deveria emitir procedimento.criado' }).toBe(1)

  const criado = (await eventos('procedimento.criado'))[0]!
  expect(criado.ator_tipo).toBe('usuario')
  expect(criado.origem).toBe('app')
  expect((criado.dados as Record<string, unknown>).preco).toBe(300)

  // -- Salvar sem mexer no preço --------------------------------------------
  await abrirEdicao(page)
  const edicao = page.locator('dialog[open]')
  await edicao.locator('input[name="duration_min"]').fill('50')
  await edicao.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(edicao).toBeHidden()

  await expect.poll(async () => {
    const { data } = await db.from('procedures').select('duration_min').eq('id', procedureId!).single()
    return data?.duration_min
  }, { message: 'a edição deveria ter sido gravada' }).toBe(50)

  expect(
    (await eventos('procedimento.preco_alterado')).length,
    'editar sem mexer no preço não pode emitir preco_alterado',
  ).toBe(0)

  // -- Agora sim, o preço ----------------------------------------------------
  await abrirEdicao(page)
  const comPreco = page.locator('dialog[open]')
  await comPreco.locator('input[name="price"]').fill(NOVO)
  await comPreco.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(comPreco).toBeHidden()

  await expect.poll(() => eventos('procedimento.preco_alterado').then(e => e.length),
    { message: 'mudar o preço deveria emitir preco_alterado' }).toBe(1)

  const alterado = (await eventos('procedimento.preco_alterado'))[0]!
  const dados = alterado.dados as Record<string, unknown>
  // O de→para é o que torna o evento acionável: "subiu 50%" não se responde
  // só com o preço novo.
  expect(dados.preco).toBe(450)
  expect(dados.precoAnterior).toBe(300)
})
