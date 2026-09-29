import { test, expect, type Page } from '@playwright/test'
import { banco, nomeDeTeste } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * O ensaio: conferir o fluxo sem que nada aconteça.
 *
 * É a resposta para "por que não disparou?" — e o que se prova aqui é
 * justamente que ele **não age**. Um ensaio que mandasse a mensagem seria pior
 * que não ter ensaio nenhum: a pessoa confere o fluxo achando que está a
 * salvo, e o cliente recebe.
 *
 * A automação fica DESLIGADA de propósito: conferir antes de ligar é o ponto.
 *
 * Roda numa rede `[e2e]`, com o fato que ele mesmo grava. Antes pegava "o
 * último `cliente.criado` da rede real" e pulava quando não havia — e nunca
 * havia: a limpeza do E2E apaga os eventos dos clientes `[e2e]`, e a corrente
 * só guarda 30 dias. Gravar o fato direto no banco não dispara automação
 * nenhuma: o motor recebe o fato de quem o emite (`lib/events/emitir.ts`), não
 * varre a corrente.
 */

const marca = Date.now().toString(36)
const nome = nomeDeTeste('Ensaio')
const TITULO = `[e2e] ensaio nao manda ${marca}`

let f: { outra: OutraRede; membro: MembroDeTeste } | null = null
let automationId: string | null = null

test.beforeAll(async () => {
  const outra = await criarOutraRede(`ens${marca}`)
  f = {
    outra,
    membro: await criarMembro(`ens${marca}`, {
      tenant: outra.tenantId, rotulo: 'Automações',
      permissoes: [{ modulo: 'automations', nivel: 'MANAGE' }],
    }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const db = banco()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  if (automationId) {
    const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', automationId)
    const ids = (runs ?? []).map(r => r.id as string)
    if (ids.length) olhar('passos', await db.from('automation_run_steps').delete().in('run_id', ids))
    olhar('execuções', await db.from('automation_runs').delete().eq('automation_id', automationId))
    olhar('versões', await db.from('automation_versions').delete().eq('automation_id', automationId))
    olhar('automação', await db.from('automations').delete().eq('id', automationId))
  }
  olhar('avisos', await db.from('user_notifications').delete().eq('title', TITULO))
  await f.membro.limpar()
  await f.outra.limpar()
  expect(falhas).toEqual([])
})

test('o ensaio percorre o fluxo, mostra o caminho e NÃO executa as ações', async ({ browser }) => {
  const db = banco()
  const tenant = f!.outra.tenantId

  // O fato que o ensaio vai repetir: o mais recente daquele tipo na rede.
  const { error: erroFato } = await db.from('domain_events').insert({
    tenant_id: tenant, nome: 'cliente.criado', entidade: 'cliente', dados: { marca },
  })
  expect(erroFato, 'gravar o fato na corrente da rede de teste').toBeNull()

  const { data: auto, error: erroAuto } = await db.from('automations').insert({
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
          config: { alvo: 'usuario', alvoId: f!.membro.userId, titulo: TITULO, corpo: 'não deveria chegar' } },
      ],
      ligacoes: [
        { id: 'l1', de: 'g1', para: 'c1' },
        { id: 'l2', de: 'c1', para: 'a1', saida: 'sim' },
      ],
    },
  }).select('id').single()
  expect(erroAuto, 'criar a automação').toBeNull()
  automationId = auto!.id as string

  const ctx = await browser.newContext({ storageState: f!.membro.estado })
  try {
    await ensaiarPelaTela(await ctx.newPage())
  } finally {
    await ctx.close()
  }
})

async function ensaiarPelaTela(page: Page) {
  const db = banco()

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
  // Pelo texto do contador, e não por `getByText('0')`: o nome do teste carrega
  // um sufixo em base 36, e quando o relógio produzia um "0" ali o seletor
  // casava com duas coisas e o teste caía sem nada a ver com o produto.
  await expect(cartao.getByText(/^0$/)).toBeVisible()
}
