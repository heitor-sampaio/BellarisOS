import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId } from './apoio/banco'

/**
 * O tempo, de ponta a ponta: a espera guarda o fluxo e o CRON o retoma.
 *
 * O que se prova aqui é a promessa central do motor — **o processo não segura
 * nada**. A espera grava uma data e devolve o run à fila; quem o faz andar de
 * novo é outra execução, outro request, possivelmente outro container. Se isso
 * não funcionasse, toda automação com espera morreria no primeiro restart, e o
 * sintoma seria mudo: o fluxo simplesmente nunca continua.
 */

const nome = nomeDeTeste('Tempo')
const TITULO = `[e2e] depois da espera ${Date.now().toString(36)}`

let automationId: string | null = null
let clientId: string | null = null

/** CPF válido no dígito verificador — o formulário confere, e o CPF é único. */
function cpfDeTeste(): string {
  const base = String(Date.now()).slice(-9).split('').map(Number)
  const dv = (nums: number[]) => {
    const peso = nums.length + 1
    const r = (nums.reduce((s, n, i) => s + n * (peso - i), 0) * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  return [...base, d1, dv([...base, d1])].join('')
}

test.afterAll(async () => {
  const db = banco()
  if (automationId) {
    const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', automationId)
    for (const r of runs ?? []) await db.from('automation_run_steps').delete().eq('run_id', r.id as string)
    await db.from('automation_runs').delete().eq('automation_id', automationId)
    await db.from('automations').delete().eq('id', automationId)
  }
  await db.from('user_notifications').delete().eq('title', TITULO)
  if (clientId) {
    await db.from('domain_events').delete().eq('entidade_id', clientId)
    await db.from('loyalty_accounts').delete().eq('client_id', clientId)
    await db.from('clients').delete().eq('id', clientId)
  }
})

test('a espera guarda o fluxo e o cron o retoma de onde parou', async ({ page, request }) => {
  const db = banco()
  const tenant = await tenantId()

  const { data: usuario } = await db
    .from('users').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()
  const { data: filial } = await db
    .from('branches').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()

  // Gatilho → esperar 1 minuto → avisar a equipe.
  const { data: auto } = await db.from('automations').insert({
    tenant_id: tenant, nome, status: 'ATIVA',
    gatilhos: ['cliente.criado'],
    grafo: {
      nos: [
        { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 },
          config: { evento: 'cliente.criado' } },
        { id: 'e1', tipo: 'espera.duracao', pos: { x: 240, y: 0 },
          config: { quantidade: 1, unidade: 'minutos' } },
        { id: 'a1', tipo: 'acao.notificar_equipe', pos: { x: 480, y: 0 },
          config: { alvo: 'usuario', alvoId: usuario!.id, titulo: TITULO, corpo: '{{cliente.nome}}' } },
      ],
      ligacoes: [
        { id: 'l1', de: 'g1', para: 'e1' },
        { id: 'l2', de: 'e1', para: 'a1' },
      ],
    },
  }).select('id').single()
  automationId = auto!.id as string

  // -- O fato, pelo caminho real --------------------------------------------
  // Nada de rota de teste: um endpoint que emite evento seria superfície
  // pública para forjar a corrente. O cliente é cadastrado pela tela, e é o
  // emissor de verdade que despacha para o motor.
  await page.goto('/admin/clients/new')
  await page.locator('input[name="name"]').fill(nome)
  await page.locator('input[name="phone"]').fill('47999991111')
  await page.locator('input[name="email"]').fill(`${Date.now().toString(36)}@e2e.local`)
  await page.locator('input[name="document"]').fill(cpfDeTeste())
  const filialSelect = page.locator('select').first()
  if (await filialSelect.count()) await filialSelect.selectOption(filial!.id as string)
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click()

  await expect.poll(async () => {
    const { data } = await db.from('clients').select('id').eq('name', nome).maybeSingle()
    clientId = (data?.id as string) ?? null
    return clientId
  }, { message: 'o cliente deveria ter sido criado' }).not.toBeNull()

  // -- O fluxo PAROU na espera, e não terminou ------------------------------
  // O poll é sobre `no_atual`, não sobre o status: um run recém-criado JÁ
  // nasce 'esperando', e olhar o status daria a espera por cumprida antes de
  // a execução sequer começar.
  await expect.poll(async () => {
    const { data } = await db
      .from('automation_runs').select('no_atual')
      .eq('automation_id', automationId!).maybeSingle()
    return data?.no_atual ?? null
  }, { message: 'a execução deveria ter parado na espera', timeout: 25_000 }).toBe('a1')

  const { data: emEspera } = await db
    .from('automation_runs').select('status').eq('automation_id', automationId!).single()
  expect(emEspera!.status).toBe('esperando')

  const { data: parado } = await db
    .from('automation_runs').select('no_atual, rodar_apos').eq('automation_id', automationId!).single()

  // `no_atual` guarda o PRÓXIMO node, não o da espera: a espera já aconteceu,
  // e apontar para ela faria o cron re-executá-la a cada retomada — "esperar 3
  // dias" viraria esperar 3 dias para sempre.
  expect(parado!.no_atual, 'a retomada começa depois da espera').toBe('a1')
  expect(new Date(parado!.rodar_apos as string).getTime(), 'a volta está no futuro')
    .toBeGreaterThan(Date.now())

  // Ninguém foi avisado ainda: a espera realmente segurou.
  const { count: antes } = await db
    .from('user_notifications').select('id', { count: 'exact', head: true }).eq('title', TITULO)
  expect(antes ?? 0, 'o aviso não pode sair antes da espera vencer').toBe(0)

  // -- O cron retoma ---------------------------------------------------------
  // Antecipa a volta em vez de esperar um minuto de relógio: o que se prova é
  // que o CRON faz o fluxo andar, não que o Date.now do Node funciona.
  await db.from('automation_runs')
    .update({ rodar_apos: new Date(Date.now() - 1000).toISOString() })
    .eq('automation_id', automationId!)

  const cron = await request.get('/api/cron/automacoes', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  expect(cron.ok(), 'o cron deveria responder').toBe(true)

  const corpo = await cron.json()
  expect(corpo.retomadas, 'o cron deveria ter retomado ao menos uma execução').toBeGreaterThan(0)

  // -- E o fluxo terminou ----------------------------------------------------
  await expect.poll(async () => {
    const { data } = await db
      .from('automation_runs').select('status').eq('automation_id', automationId!).maybeSingle()
    return data?.status ?? null
  }, { message: 'depois do cron, a execução deveria terminar', timeout: 20_000 }).toBe('ok')

  const { data: avisos } = await db
    .from('user_notifications').select('body').eq('title', TITULO)
  expect((avisos ?? []).length, 'o aviso sai depois da espera').toBeGreaterThan(0)
  expect(avisos![0]!.body).toContain(nome)

  // O passo a passo registra a espera como um passo próprio — é o que explica,
  // depois, por que a automação demorou.
  const { data: run } = await db
    .from('automation_runs').select('id').eq('automation_id', automationId!).single()
  const { data: passos } = await db
    .from('automation_run_steps').select('tipo, status').eq('run_id', run!.id as string).order('ordem')

  expect((passos ?? []).map(p => p.tipo)).toEqual([
    'gatilho.evento', 'espera.duracao', 'acao.notificar_equipe',
  ])
})
