import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId } from './apoio/banco'

/**
 * O anel: duas automações que se alimentam pela corrente de eventos.
 *
 * É o defeito mais caro possível desta frente — mensagem ao cliente em laço,
 * etapa indo e voltando, uma execução gerando a próxima para sempre. O
 * validador do quadro recusa o anel DENTRO de um grafo; este aqui é outro: os
 * dois grafos são linhas retas, e o anel se fecha porque a AÇÃO de uma emite o
 * evento que dispara a outra.
 *
 * Duas automações e não uma porque com uma só o anel morreria sozinho: a
 * segunda passagem tentaria adicionar uma tag que já está lá, não alteraria
 * nada e não emitiria evento. O par adiciona-e-remove alterna de verdade, e
 * então a ÚNICA coisa que segura é a profundidade.
 *
 * O que se prova não é "zero execuções" — o encadeamento é desejado, é o que
 * permite um fluxo disparar outro. O que se prova é que ele **para**.
 */

const nome = nomeDeTeste('Anel')
const TAG  = `[e2e]anel${Date.now().toString(36)}`

const ids: string[] = []
let clientId: string | null = null

test.afterAll(async () => {
  const db = banco()
  for (const id of ids) {
    const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', id)
    for (const r of runs ?? []) await db.from('automation_run_steps').delete().eq('run_id', r.id as string)
    await db.from('automation_runs').delete().eq('automation_id', id)
    await db.from('automations').delete().eq('id', id)
  }
  if (clientId) {
    await db.from('domain_events').delete().eq('entidade_id', clientId)
    await db.from('loyalty_accounts').delete().eq('client_id', clientId)
    await db.from('clients').delete().eq('id', clientId)
  }
})

test('duas automações que se alimentam param no teto de profundidade', async ({ page }) => {
  // Este teste ESPERA o motor sossegar: 25s para o anel começar a rodar e até
  // 30s para a contagem parar de mudar. São ~55s só de espera, e o limite
  // padrão da suíte é 60s — sozinho ele cabia, dentro do conjunto (com o dev
  // server dividido com os outros) estourava. O limite é do TESTE, não do
  // motor: o que se prova aqui é que a contagem estabiliza, e ela estabiliza.
  test.setTimeout(150_000)

  const db = banco()
  const tenant = await tenantId()

  const { data: filial } = await db
    .from('branches').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single()

  const { data: cliente } = await db.from('clients').insert({
    tenant_id: tenant, branch_id: filial!.id, name: nome, phone: '47999990000',
  }).select('id').single()
  clientId = cliente!.id as string

  // O par: uma põe a tag, a outra tira. As duas assinam o mesmo evento, e a
  // ação de cada uma emite justamente esse evento.
  for (const modo of ['adicionar', 'remover'] as const) {
    const { data } = await db.from('automations').insert({
      tenant_id: tenant,
      nome:      `${nome} · ${modo}`,
      status:    'ATIVA',
      gatilhos:  ['cliente.dados_alterados'],
      grafo: {
        nos: [
          { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 },
            config: { evento: 'cliente.dados_alterados' } },
          { id: 'a1', tipo: 'acao.tag_cliente', pos: { x: 260, y: 0 },
            config: { tag: TAG, modo } },
        ],
        ligacoes: [{ id: 'l1', de: 'g1', para: 'a1' }],
      },
    }).select('id').single()
    ids.push(data!.id as string)
  }

  // -- O pavio: uma edição de verdade, pela tela ------------------------------
  // Tem de passar pelo app: é o emissor que despacha para o motor, e alterar o
  // banco por fora não dispararia nada.
  await page.goto(`/admin/clients/${clientId}?tab=dados`)
  const abaDados = page.getByRole('button', { name: 'Dados' })
    .or(page.getByRole('link', { name: 'Dados' })).first()
  if (await abaDados.isVisible()) await abaDados.click()

  const campoNome = page.locator('xpath=//p[normalize-space()="Nome *"]/following::input[1]')
  await campoNome.fill(`${nome} editado`)
  await page.getByRole('button', { name: /Salvar dados/ }).click()

  await expect.poll(async () => {
    const { data } = await db.from('clients').select('name').eq('id', clientId!).single()
    return data?.name
  }, { message: 'a edição deveria ter sido gravada' }).toBe(`${nome} editado`)

  // -- O anel roda… -----------------------------------------------------------
  const contar = async () => {
    const { count } = await db
      .from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .in('automation_id', ids)
    return count ?? 0
  }

  await expect.poll(contar, {
    message: 'as automações deveriam ter rodado', timeout: 25_000,
  }).toBeGreaterThan(0)

  // -- …e PARA ---------------------------------------------------------------
  // Esperar até o número PARAR de mudar, e não comparar duas medidas
  // arbitrárias: o anel leva alguns segundos para dar as voltas que pode dar, e
  // medir no meio acusaria laço onde há só encadeamento em andamento.
  let anterior = -1
  let estavel  = 0
  let depois   = 0

  for (let i = 0; i < 20 && estavel < 3; i++) {
    await new Promise(r => setTimeout(r, 1500))
    depois = await contar()
    estavel = depois === anterior ? estavel + 1 : 0
    anterior = depois
  }

  expect(estavel, 'o número de execuções tem de estabilizar — se subir para sempre, há laço').toBeGreaterThanOrEqual(3)
  // O número exato depende de quantas execuções alteram algo de verdade (a
  // tag alterna, então nem toda passagem emite evento). O que importa é a
  // ordem de grandeza: com a trava são unidades; sem ela, seriam centenas em
  // poucos segundos.
  expect(depois, 'o anel tem de fechar em poucas voltas, não em centenas').toBeLessThanOrEqual(20)

  // A profundidade é o mecanismo, e nenhuma execução passa do teto.
  const { data: runs } = await db
    .from('automation_runs').select('profundidade').in('automation_id', ids)
  for (const r of runs ?? []) {
    expect(r.profundidade as number, 'nenhuma execução pode passar da profundidade máxima').toBeLessThan(3)
  }

  // Os eventos gerados pelas ações saem marcados como da automação — é por
  // essa marca que o motor distingue o que ELE fez do que uma pessoa fez.
  const { data: daAutomacao } = await db
    .from('domain_events').select('origem, ator_nome')
    .eq('entidade_id', clientId!).eq('origem', 'automacao')

  expect((daAutomacao ?? []).length, 'as alterações da automação têm origem própria').toBeGreaterThan(0)
  expect(daAutomacao![0]!.ator_nome).toContain('Automação')
})
