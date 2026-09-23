import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId, filiaisAtivas } from './apoio/banco'

/**
 * A Fase 1 do motor, de ponta a ponta e sem tela: cadastrar um cliente pelo
 * `/admin` tem de emitir `cliente.criado`, criar a execução, passar pelo IF e
 * avisar a equipe.
 *
 * A automação é inserida por SQL porque o quadro ainda não existe — o que se
 * prova aqui é o MOTOR, não o editor. O grafo é o mesmo que o editor vai
 * produzir: gatilho → condição → ação.
 */

const nome = nomeDeTeste('Cliente automacao')
const TITULO = `[e2e] Chegou ${Date.now().toString(36)}`

let automationId: string | null = null
let clientId: string | null = null

/**
 * CPF válido no dígito verificador, a partir do relógio.
 *
 * O formulário valida o DV, então um `11111111111` é recusado; e o CPF é único
 * por rede, então um fixo colide na segunda rodada.
 */
function cpfDeTeste(): string {
  const base = String(Date.now()).slice(-9).split('').map(Number)
  const dv = (nums: number[]) => {
    const peso = nums.length + 1
    const soma = nums.reduce((s, n, i) => s + n * (peso - i), 0)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(base)
  const d2 = dv([...base, d1])
  return [...base, d1, d2].join('')
}

test.beforeAll(async () => {
  const db = banco()
  const tenant = await tenantId()

  // Avisar UMA pessoa conhecida, e não um cargo: a asserção fica sobre um
  // destinatário determinístico em vez de "alguém da equipe".
  const { data: usuario } = await db
    .from('users').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()
  const usuarioId = usuario!.id as string

  const grafo = {
    nos: [
      { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 },
        config: { evento: 'cliente.criado' } },
      { id: 'c1', tipo: 'condicao.se', pos: { x: 260, y: 0 },
        config: { grupo: { juncao: 'e', regras: [
          { campo: 'cliente.telefone', operador: 'preenchido' },
        ] } } },
      { id: 'a1', tipo: 'acao.notificar_equipe', pos: { x: 520, y: 0 },
        config: {
          alvo: 'usuario', alvoId: usuarioId,
          titulo: TITULO,
          corpo:  '{{cliente.nome}} · {{cliente.telefone}}',
        } },
    ],
    ligacoes: [
      { id: 'l1', de: 'g1', para: 'c1' },
      { id: 'l2', de: 'c1', para: 'a1', saida: 'sim' },
    ],
  }

  const { data, error } = await db.from('automations').insert({
    tenant_id: tenant,
    nome:      nomeDeTeste('Automacao'),
    status:    'ATIVA',
    gatilhos:  ['cliente.criado'],
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
  if (clientId) {
    await db.from('domain_events').delete().eq('entidade_id', clientId)
    await db.from('loyalty_accounts').delete().eq('client_id', clientId)
    await db.from('clients').delete().eq('id', clientId)
  }
})

test('cliente novo dispara a automação: execução, passos e aviso à equipe', async ({ page }) => {
  const db = banco()
  const unidade = (await filiaisAtivas())[0]!

  await page.goto('/admin/clients/new')
  await page.locator('input[name="name"]').fill(nome)
  await page.locator('input[name="phone"]').fill('47988771234')
  // E-mail e CPF são obrigatórios aqui: cadastrar cliente cria o acesso dele
  // ao app (login = e-mail, senha = CPF).
  await page.locator('input[name="email"]').fill(`${Date.now().toString(36)}@e2e.local`)
  await page.locator('input[name="document"]').fill(cpfDeTeste())
  // Pela rede não há unidade corrente: a de cadastro é escolhida no formulário.
  const filial = page.locator('select').first()
  if (await filial.count()) await filial.selectOption(unidade.id)
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click()

  await expect.poll(async () => {
    const { data } = await db.from('clients').select('id').eq('name', nome).maybeSingle()
    clientId = (data?.id as string) ?? null
    return clientId
  }, { message: 'o cliente deveria ter sido criado' }).not.toBeNull()

  // -- A execução ------------------------------------------------------------
  // O despacho roda em `after()`, depois da resposta: o poll é o certo aqui,
  // não um `expect` seco.
  await expect.poll(async () => {
    const { data } = await db
      .from('automation_runs')
      .select('id, status, erro')
      .eq('automation_id', automationId!)
      .maybeSingle()
    return data?.status ?? null
  }, { message: 'a automação deveria ter rodado até o fim', timeout: 20_000 }).toBe('ok')

  const { data: run } = await db
    .from('automation_runs').select('id, evento_id, profundidade')
    .eq('automation_id', automationId!).single()

  expect(run!.evento_id, 'a execução tem de apontar para o fato que a disparou').not.toBeNull()
  expect(run!.profundidade, 'fato de gente nasce na profundidade zero').toBe(0)

  // -- O passo a passo -------------------------------------------------------
  // É ele que responde "por que não disparou?" — sem isto, a resposta é palpite.
  const { data: passos } = await db
    .from('automation_run_steps').select('ordem, tipo, status, resumo')
    .eq('run_id', run!.id as string).order('ordem')

  expect((passos ?? []).map(p => p.tipo)).toEqual([
    'gatilho.evento', 'condicao.se', 'acao.notificar_equipe',
  ])
  expect((passos ?? []).every(p => p.status === 'ok')).toBe(true)
  expect((passos![1]!.resumo as { resultado?: string }).resultado).toBe('sim')

  // -- O efeito --------------------------------------------------------------
  const { data: avisos } = await db
    .from('user_notifications').select('title, body').eq('title', TITULO)

  expect((avisos ?? []).length, 'alguém da equipe deveria ter sido avisado').toBeGreaterThan(0)
  // As variáveis foram trocadas pelos valores do cliente, não deixadas cruas.
  expect(avisos![0]!.body).toContain(nome)
  // O telefone sai como está no cadastro — formatado, não como foi digitado.
  expect(avisos![0]!.body).toContain('(47) 98877-1234')
})
