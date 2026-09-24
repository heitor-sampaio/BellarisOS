import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId } from './apoio/banco'

/**
 * As duas escolhas que o painel passou a fazer direito.
 *
 *  - **o funil antes da etapa** — com mais de um funil, uma lista única de
 *    "Funil · Etapa" cresce pelo produto das duas coisas e obriga a ler o
 *    prefixo de cada linha. O seletor de funil só aparece quando há o que
 *    escolher: com um funil só, seria uma escolha de uma opção;
 *  - **o gatilho de tempo de tempos em tempos** — "a cada 30 minutos" não tem
 *    horário do dia, e "todo dia" não tem intervalo. O formulário tem de
 *    trocar de campo junto com a frequência, senão o grafo guarda um horário
 *    que ninguém lê.
 *
 * Os dois se conferem pela TELA e pelo GRAFO SALVO: o painel mostrando uma
 * coisa e o banco guardando outra é o defeito de formulário que não avisa.
 */

const criadas: string[] = []
let funilExtraId: string | null = null
const marca = Date.now().toString(36)
const NOME_FUNIL = `[e2e] Pós-venda ${marca}`
const ETAPA_DO_EXTRA = `[e2e] Retorno ${marca}`

test.afterAll(async () => {
  const db = banco()
  for (const id of criadas) {
    const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', id)
    for (const r of runs ?? []) await db.from('automation_run_steps').delete().eq('run_id', r.id as string)
    await db.from('automation_runs').delete().eq('automation_id', id)
    await db.from('automations').delete().eq('id', id)
  }
  // As etapas vão junto por cascade.
  if (funilExtraId) await db.from('crm_funnels').delete().eq('id', funilExtraId)
})

async function novaAutomacao(page: import('@playwright/test').Page, comNome: string): Promise<string> {
  await page.goto('/admin/automacoes')
  await page.getByRole('button', { name: 'Nova automação' }).click()
  await page.getByPlaceholder('Nome da automação').fill(comNome)
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await page.waitForURL(/\/admin\/automacoes\/[0-9a-f-]{36}/)
  const id = page.url().split('/').pop()!
  criadas.push(id)
  return id
}

test('com mais de um funil, escolhe-se o funil e depois a etapa', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()

  // Um segundo funil, para o seletor ter o que oferecer. Sem ele o teste
  // provaria o contrário do que quer: um funil só não mostra seletor nenhum.
  const { data: funil, error } = await db
    .from('crm_funnels')
    .insert({ tenant_id: tenant, name: NOME_FUNIL, position: 90 })
    .select('id')
    .single()
  if (error) throw new Error(`Não consegui criar o funil de teste: ${error.message}`)
  funilExtraId = funil!.id as string

  const { error: erroEtapas } = await db.from('crm_stages').insert([
    { tenant_id: tenant, funnel_id: funilExtraId, name: ETAPA_DO_EXTRA, position: 0, outcome: 'OPEN' },
  ])
  if (erroEtapas) throw new Error(`Não consegui criar a etapa de teste: ${erroEtapas.message}`)

  const id = await novaAutomacao(page, nomeDeTeste('Funil'))
  const painel = page.getByLabel('Configuração do node')

  await page.getByRole('button', { name: 'Mover de etapa' }).click()

  // O seletor de funil existe e a etapa espera por ele: oferecer as etapas de
  // todos os funis de uma vez é o que este ajuste tira da tela.
  // Ancorado no começo: o `Campo` é um <label> que envolve o select, então o
  // nome acessível traz junto as opções — e a opção vazia da etapa diz
  // "Escolha o funil primeiro…", que casaria com um `getByLabel('Funil')` solto.
  await expect(painel.getByLabel(/^Funil/)).toBeVisible()
  await expect(painel.getByLabel(/^Mover para/)).toBeDisabled()

  await painel.getByLabel(/^Funil/).selectOption({ label: NOME_FUNIL })

  const etapa = painel.getByLabel(/^Mover para/)
  await expect(etapa).toBeEnabled()
  // Só as etapas do funil escolhido — e sem o prefixo, que agora está acima.
  await expect(etapa.locator('option')).toHaveText(['Escolha a etapa…', ETAPA_DO_EXTRA])

  await etapa.selectOption({ label: ETAPA_DO_EXTRA })
  // O mesmo botão diz "Salvar" e, depois de gravar, "Salvo" — é ele que marca
  // o fim da ida ao servidor.
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible()

  // O que ficou gravado é o ID da etapa — o funil é só o caminho até ela.
  const { data: salva } = await db.from('automations').select('grafo').eq('id', id).single()
  const no = (salva!.grafo as { nos: { tipo: string; config: Record<string, unknown> }[] })
    .nos.find(n => n.tipo === 'acao.mover_etapa')!

  const { data: etapaSalva } = await db
    .from('crm_stages').select('funnel_id').eq('id', no.config.etapaId as string).single()

  expect(etapaSalva!.funnel_id).toBe(funilExtraId)
  expect(no.config.etapaNome).toBe(ETAPA_DO_EXTRA)
  // O nome do funil vai junto só quando há mais de um: é ele que desfaz o
  // "para Fechamento" ambíguo no card do quadro.
  expect(no.config.funilNome).toBe(NOME_FUNIL)
})

test('o gatilho de tempo aceita de quanto em quanto, não só um horário', async ({ page }) => {
  const db = banco()
  const id = await novaAutomacao(page, nomeDeTeste('Relogio'))
  const painel = page.getByLabel('Configuração do node')

  await page.getByRole('button', { name: 'Pelo relógio' }).click()

  // Nasce no horário do dia, como antes.
  await expect(painel.getByLabel(/^Às/)).toBeVisible()

  await painel.getByLabel(/^Com que frequência/).selectOption('minutos')

  // Os campos trocam junto: horário do dia não existe em "a cada X minutos".
  await expect(painel.getByLabel(/^Às/)).toBeHidden()
  await expect(painel.getByLabel(/^A cada \(minutos\)/)).toHaveValue('30')

  // Abaixo do ritmo do próprio relógio o fluxo não liga — prometer "a cada 1
  // minuto" seria prometer o que o cron não entrega.
  await painel.getByLabel(/^A cada \(minutos\)/).fill('1')
  await expect(page.getByText(/menor intervalo/)).toBeVisible()

  await painel.getByLabel(/^A cada \(minutos\)/).fill('45')
  await expect(page.getByText(/menor intervalo/)).toBeHidden()

  // O mesmo botão diz "Salvar" e, depois de gravar, "Salvo" — é ele que marca
  // o fim da ida ao servidor.
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Salvo', { exact: true })).toBeVisible()

  const { data: salva } = await db.from('automations').select('grafo').eq('id', id).single()
  const no = (salva!.grafo as { nos: { tipo: string; config: Record<string, unknown> }[] })
    .nos.find(n => n.tipo === 'gatilho.agenda')!

  expect(no.config.frequencia).toBe('minutos')
  expect(no.config.intervalo).toBe(45)
  // A hora sai do grafo: guardá-la faria o JSON parecer respeitar um horário
  // que o motor não lê nesta frequência.
  expect(no.config.hora).toBeUndefined()
})
