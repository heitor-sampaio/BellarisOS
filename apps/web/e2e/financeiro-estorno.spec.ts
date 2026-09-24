import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas, nomeDeTeste, tenantId } from './apoio/banco'

/**
 * O estorno, que era a gravação mais arriscada do sistema.
 *
 * Eram duas escritas soltas — a contra-transação e a marca na original — sem
 * transação entre elas e sem nenhuma checar o erro. Falhar no meio deixava o
 * estorno pela metade, e é o pior meio possível: os indicadores leem os DOIS
 * lados (CLAUDE.md §13.1), então com a contra-transação criada e a original
 * sem marca o estorno bate duas vezes no resultado.
 *
 * O que se prova aqui:
 *
 *  - os dois lados existem depois de um estorno pela tela;
 *  - a contra-transação nasce na filial DO REGISTRO — a action recebia a
 *    filial do cliente e dava para lançar a despesa em outra unidade;
 *  - estornar duas vezes é recusado, em vez de gerar uma segunda
 *    contra-transação.
 *
 * O outro arquivo de dinheiro deixa o estorno de fora para não sujar o banco
 * de desenvolvimento; aqui o rastro é limpo no fim, os dois lados.
 */

const descricao = nomeDeTeste('receita a estornar')
const criadas: string[] = []

test.afterAll(async () => {
  const db = banco()
  for (const id of criadas) await db.from('financial_transactions').delete().eq('id', id)
  // A contra-transação nasce com a descrição prefixada — some junto.
  await db.from('financial_transactions').delete().eq('description', `Estorno: ${descricao}`)
})

test('estornar grava os dois lados, na filial do registro, e não repete', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()
  const unidades = await filiaisAtivas()
  const unidade = unidades[0]!

  // Uma receita paga, direto no banco: o que está sob teste é o estorno, e
  // lançar pela tela já é coberto em fase1-dinheiro.
  const { data: original, error } = await db
    .from('financial_transactions')
    .insert({
      branch_id:   unidade.id,
      type:        'INCOME',
      category:    'Serviço',
      description: descricao,
      amount:      150,
      is_paid:     true,
      paid_at:     new Date().toISOString(),
      created_by:  'e2e',
    })
    .select('id')
    .single()
  if (error) throw new Error(`Não consegui criar a receita de teste: ${error.message}`)
  criadas.push(original!.id as string)

  // -- Estornar pela tela ----------------------------------------------------
  await page.goto('/admin/financeiro')
  const linha = page.locator('tr').filter({ hasText: descricao }).first()
  await expect(linha).toBeVisible()
  await linha.getByTitle('Estornar').click()

  // O aviso é a prova de que a tela parou de descartar o resultado da action.
  await expect(page.getByText('Lançamento estornado.')).toBeVisible()

  // -- Os dois lados ---------------------------------------------------------
  await expect.poll(async () => {
    const { data } = await db.from('financial_transactions')
      .select('notes').eq('id', original!.id).single()
    return data?.notes ?? null
  }, { message: 'a original deveria ficar marcada como estornada' }).toBe('Estornada')

  const { data: contra } = await db
    .from('financial_transactions')
    .select('id, type, category, amount, branch_id, is_paid')
    .eq('description', `Estorno: ${descricao}`)
    .maybeSingle()

  expect(contra, 'a contra-transação deveria existir').not.toBeNull()
  expect(contra!.type).toBe('EXPENSE')          // inverte o sentido da original
  expect(contra!.category).toBe('Estorno')      // é por ela que a métrica acha
  expect(Number(contra!.amount)).toBe(150)
  expect(contra!.is_paid).toBe(true)
  // A filial vem do registro estornado, não de quem chamou.
  expect(contra!.branch_id).toBe(unidade.id)

  // -- Estornar de novo é recusado -------------------------------------------
  // Pela função, não pela tela: depois do primeiro estorno o botão some, e o
  // que precisa estar protegido é a regra, não o botão.
  const { error: segundo } = await db.rpc('estornar_transacao', {
    p_transacao: original!.id,
    p_tenant:    tenant,
    p_ator:      'e2e',
  })
  expect(segundo?.message ?? '').toContain('já foi estornado')

  const { count } = await db
    .from('financial_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('description', `Estorno: ${descricao}`)
  expect(count, 'não pode nascer uma segunda contra-transação').toBe(1)
})

test('estorno de outra rede não encontra o lançamento', async ({ page: _page }) => {
  const db = banco()
  const unidades = await filiaisAtivas()

  const { data: alvo, error } = await db
    .from('financial_transactions')
    .insert({
      branch_id:   unidades[0]!.id,
      type:        'INCOME',
      category:    'Serviço',
      description: nomeDeTeste('receita de outra rede'),
      amount:      10,
      is_paid:     true,
      paid_at:     new Date().toISOString(),
      created_by:  'e2e',
    })
    .select('id, description')
    .single()
  if (error) throw new Error(error.message)
  criadas.push(alvo!.id as string)

  // Tenant inventado: a função tem de responder o mesmo que responderia para
  // um id inexistente — quem não tem acesso não deve distinguir os dois casos.
  const { error: recusa } = await db.rpc('estornar_transacao', {
    p_transacao: alvo!.id,
    p_tenant:    '00000000-0000-0000-0000-000000000000',
    p_ator:      'e2e',
  })
  expect(recusa?.message ?? '').toContain('não encontrado')

  const { data: depois } = await db
    .from('financial_transactions').select('notes').eq('id', alvo!.id).single()
  expect(depois?.notes ?? null, 'nada pode ter sido marcado').toBeNull()
})
