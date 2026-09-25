import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas, nomeDeTeste } from './apoio/banco'

/**
 * O lançamento aparece na lista NO INSTANTE em que é criado.
 *
 * Havia uma corrida de relógio: a lista filtrava `created_at <= to`, e o `to`
 * do `resolvePeriod` é a janela **decorrida** — "agora", medido no relógio do
 * app. O `created_at` vem do relógio do Postgres, que está à frente (medi 0,2s
 * contra o Supabase). Um lançamento feito neste segundo nascia com data no
 * futuro e **sumia da tela que acabou de criá-lo**.
 *
 * A janela decorrida existe para o delta comparar períodos de mesmo tamanho;
 * numa lista ela não tem função nenhuma. O `fullTo` é o fim do período.
 *
 * O sintoma que me levou até aqui era outro: `financeiro-estorno.spec.ts`
 * passava sozinho e falhava depois de `fase1-dinheiro`. Parecia ordem dos
 * testes; era o intervalo entre gravar e abrir a tela.
 */

const descricao = nomeDeTeste('lancamento imediato')
const criadas: string[] = []

test.afterAll(async () => {
  const db = banco()
  for (const id of criadas) await db.from('financial_transactions').delete().eq('id', id)
})

for (const rodada of [1, 2, 3]) {
  test(`lançamento criado agora está na lista — rodada ${rodada}`, async ({ page }) => {
    const db = banco()
    const unidade = (await filiaisAtivas())[0]!
    const texto = `${descricao} ${rodada}`

    // Sem folga entre gravar e abrir: é o pior caso, e era ele que falhava.
    const { data, error } = await db
      .from('financial_transactions')
      .insert({
        branch_id: unidade.id, type: 'INCOME', category: 'Serviço',
        description: texto, amount: 12, is_paid: true,
        paid_at: new Date().toISOString(), created_by: 'e2e',
      })
      .select('id')
      .single()
    if (error) throw new Error(`não criei a receita: ${error.message}`)
    criadas.push(data!.id as string)

    await page.goto('/admin/financeiro')
    await expect(page.locator('tr').filter({ hasText: texto }).first()).toBeVisible()
  })
}
