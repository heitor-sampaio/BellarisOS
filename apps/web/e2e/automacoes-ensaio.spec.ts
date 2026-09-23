import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId } from './apoio/banco'

/**
 * O ensaio: conferir o fluxo sem que nada aconteça.
 *
 * É a resposta para "por que não disparou?" — e o que se prova aqui é
 * justamente que ele **não age**. Um ensaio que mandasse a mensagem seria pior
 * que não ter ensaio nenhum: a pessoa confere o fluxo achando que está a
 * salvo, e o cliente recebe.
 *
 * A automação fica DESLIGADA de propósito: conferir antes de ligar é o ponto.
 */

const nome = nomeDeTeste('Ensaio')
const TITULO = `[e2e] ensaio nao manda ${Date.now().toString(36)}`

let automationId: string | null = null

test.afterAll(async () => {
  const db = banco()
  if (!automationId) return
  const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', automationId)
  for (const r of runs ?? []) await db.from('automation_run_steps').delete().eq('run_id', r.id as string)
  await db.from('automation_runs').delete().eq('automation_id', automationId)
  await db.from('automations').delete().eq('id', automationId)
  await db.from('user_notifications').delete().eq('title', TITULO)
})

test('o ensaio percorre o fluxo, mostra o caminho e NÃO executa as ações', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()

  const { data: usuario } = await db
    .from('users').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()

  // Precisa de um fato real na corrente para o ensaio repetir.
  const { data: fato } = await db
    .from('domain_events').select('id').eq('tenant_id', tenant)
    .eq('nome', 'cliente.criado').limit(1).maybeSingle()
  test.skip(!fato, 'a corrente ainda não tem cliente.criado neste banco')

  const { data: auto } = await db.from('automations').insert({
    tenant_id: tenant, nome,
    // DESLIGADA: é assim que se confere antes de ligar.
    status:   'RASCUNHO',
    gatilhos: ['cliente.criado'],
    grafo: {
      nos: [
        { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 },
          config: { evento: 'cliente.criado' } },
        { id: 'c1', tipo: 'condicao.se', pos: { x: 240, y: 0 },
          config: { grupo: { juncao: 'e', regras: [
            { campo: 'evento.nome', operador: 'igual', valor: 'cliente.criado' },
          ] } } },
        { id: 'a1', tipo: 'acao.notificar_equipe', pos: { x: 480, y: 0 },
          config: { alvo: 'usuario', alvoId: usuario!.id, titulo: TITULO, corpo: 'não deveria chegar' } },
      ],
      ligacoes: [
        { id: 'l1', de: 'g1', para: 'c1' },
        { id: 'l2', de: 'c1', para: 'a1', saida: 'sim' },
      ],
    },
  }).select('id').single()
  automationId = auto!.id as string

  // -- Ensaiar pela tela -----------------------------------------------------
  await page.goto(`/admin/automacoes/${automationId}`)
  await page.getByRole('button', { name: 'Execuções' }).click()

  const painel = page.getByLabel('Execuções da automação')
  await expect(painel.getByText('Esta automação ainda não rodou.')).toBeVisible()

  await painel.getByRole('button', { name: /Ensaiar com o último fato/ }).click()

  // -- O caminho aparece -----------------------------------------------------
  await expect(painel.getByText('ensaio').first()).toBeVisible({ timeout: 15_000 })
  await expect(painel.getByText('Concluída').first()).toBeVisible()

  // A condição foi avaliada DE VERDADE — é isso que faz o ensaio responder
  // "por que não disparou".
  await expect(painel.getByText(/Resultado: sim/)).toBeVisible()
  // E a ação foi apenas anotada.
  await expect(painel.getByText(/Faria:/)).toBeVisible()

  // -- E nada aconteceu ------------------------------------------------------
  const { count } = await db
    .from('user_notifications').select('id', { count: 'exact', head: true }).eq('title', TITULO)
  expect(count ?? 0, 'o ensaio NÃO pode ter avisado ninguém').toBe(0)

  const { data: run } = await db
    .from('automation_runs').select('simulacao, status').eq('automation_id', automationId!).single()
  expect(run!.simulacao, 'a execução fica marcada como ensaio').toBe(true)
  expect(run!.status).toBe('ok')

  // O ensaio não entra na contagem da lista: contá-lo faria a clínica achar
  // que o fluxo rodou sozinho.
  await page.goto('/admin/automacoes')
  const cartao = page.locator('a', { hasText: nome })
  await expect(cartao.getByText('0')).toBeVisible()
})
