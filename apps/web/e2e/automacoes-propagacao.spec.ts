import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId, apagarConversas } from './apoio/banco'

/**
 * O fluxo que o Heitor pediu e que **não era montável**: decidir pelo texto da
 * mensagem que chegou, e depois usar o que o passo anterior produziu.
 *
 *   mensagem recebida → SE o texto contém "preço" → avisar a equipe
 *
 * Duas coisas são provadas aqui, e as duas falhavam antes:
 *
 *  1. **o IF lê o payload do gatilho** (`evento.dados.texto`). O motor sempre
 *     soube ler qualquer caminho; a tela é que não oferecia nenhum campo do
 *     evento, então esta condição não existia na prática;
 *  2. **a saída de um passo chega ao seguinte** (`{{passos.se.resultado}}`).
 *     O resumo de cada node ia só para o histórico do run — nenhum node
 *     conseguia reagir ao que o anterior fez.
 *
 * A mensagem entra pelo webhook, que é o caminho real: emitir o evento na mão
 * provaria o motor com um fato que ninguém produziu.
 */

const TITULO = `[e2e] Pergunta de preco ${Date.now().toString(36)}`
const TEXTO  = 'Oi, qual o preço do botox?'
const telefone = '5548' + String(Date.now()).slice(-9)

let automationId: string | null = null
let convId: string | null = null

test.beforeAll(async () => {
  const db = banco()
  const tenant = await tenantId()

  const { data: usuario } = await db
    .from('users').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()

  const grafo = {
    nos: [
      { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 },
        nome: 'Quando acontecer',
        config: { evento: 'conversa.mensagem_recebida' } },
      { id: 'c1', tipo: 'condicao.se', pos: { x: 260, y: 0 },
        nome: 'Se',
        config: { grupo: { juncao: 'e', regras: [
          // O campo que não existia na tela.
          { campo: 'evento.dados.texto', operador: 'contem', valor: 'preço' },
        ] } } },
      { id: 'a1', tipo: 'acao.notificar_equipe', pos: { x: 520, y: 0 },
        nome: 'Avisar a equipe',
        config: {
          alvo: 'usuario', alvoId: usuario!.id as string,
          titulo: TITULO,
          // O texto do cliente E o resultado do passo anterior, no mesmo corpo.
          corpo:  'Disse: {{evento.dados.texto}} · condição: {{passos.se.resultado}}',
        } },
    ],
    ligacoes: [
      { id: 'l1', de: 'g1', para: 'c1' },
      { id: 'l2', de: 'c1', para: 'a1', saida: 'sim' },
    ],
  }

  const { data, error } = await db.from('automations').insert({
    tenant_id: tenant,
    nome:      nomeDeTeste('Propagacao'),
    status:    'ATIVA',
    gatilhos:  ['conversa.mensagem_recebida'],
    grafo,
  }).select('id').single()

  if (error) throw new Error(`Não consegui criar a automação: ${error.message}`)
  automationId = data.id as string
})

test.afterAll(async () => {
  const db = banco()
  if (automationId) {
    const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', automationId)
    for (const r of runs ?? []) await db.from('automation_run_steps').delete().eq('run_id', r.id as string)
    await db.from('automation_runs').delete().eq('automation_id', automationId)
    await db.from('automations').delete().eq('id', automationId)
  }
  await db.from('user_notifications').delete().eq('title', TITULO)
  if (convId) {
    await apagarConversas([convId])
  }
})

test('o IF decide pelo texto da mensagem e o aviso cita o passo anterior', async ({ request }) => {
  const db = banco()

  const { data: cfg } = await db.from('integration_configs')
    .select('config').eq('provider', 'uazapi').eq('is_active', true).maybeSingle()
  const token = (cfg?.config as Record<string, string> | null)?.token
  test.skip(!token, 'uazapi não configurada neste banco')

  const res = await request.post('/api/webhooks/uazapi', {
    data: {
      token,
      data: {
        chat: { name: '[e2e] Contato preco', phone: telefone },
        message: {
          sender_pn: telefone,
          chatid: `${telefone}@s.whatsapp.net`,
          text: TEXTO,
          messageTimestamp: Math.floor(Date.now() / 1000),
          id: 'E2E_PROP_' + Date.now(),
          fromMe: false,
        },
      },
    },
  })
  expect(res.ok()).toBe(true)

  await expect.poll(async () => {
    const { data } = await db.from('conversations')
      .select('id').eq('contact_phone', telefone).maybeSingle()
    convId = (data?.id as string) ?? null
    return convId
  }, { message: 'a conversa deveria ter nascido do webhook' }).not.toBeNull()

  // -- A execução ------------------------------------------------------------
  // O despacho roda em `after()`, depois da resposta do webhook.
  await expect.poll(async () => {
    const { data } = await db
      .from('automation_runs').select('status')
      .eq('automation_id', automationId!).maybeSingle()
    return data?.status ?? null
  }, { message: 'a automação deveria ter rodado até o fim', timeout: 20_000 }).toBe('ok')

  const { data: run } = await db
    .from('automation_runs').select('id, contexto')
    .eq('automation_id', automationId!).single()

  // -- 1. O IF leu o texto da mensagem --------------------------------------
  const { data: passos } = await db
    .from('automation_run_steps').select('ordem, tipo, status, resumo')
    .eq('run_id', run!.id as string).order('ordem')

  expect((passos ?? []).map(p => p.tipo)).toEqual([
    'gatilho.evento', 'condicao.se', 'acao.notificar_equipe',
  ])
  expect(
    (passos![1]!.resumo as { resultado?: string }).resultado,
    'a condição sobre evento.dados.texto tinha de dar "sim"',
  ).toBe('sim')

  // -- 2. A saída de cada passo ficou no contexto ---------------------------
  const contexto = run!.contexto as { passos?: Record<string, Record<string, unknown>> }
  expect(contexto.passos?.se?.resultado).toBe('sim')
  expect(contexto.passos?.avisar_a_equipe?.avisados).toBe(1)

  // -- 3. E chegou interpolada no aviso -------------------------------------
  // É a prova de ponta a ponta: o corpo carrega o texto do cliente E o
  // resultado do passo anterior.
  const { data: aviso } = await db
    .from('user_notifications').select('body').eq('title', TITULO).maybeSingle()

  expect(aviso?.body).toContain('preço do botox')
  expect(aviso?.body).toContain('condição: sim')
})
