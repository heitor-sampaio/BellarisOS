import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, tenantId } from './apoio/banco'
import { chamarAcao } from './apoio/acao-direta'

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
 * segunda passagem tentaria mover para a etapa em que o card já está, não
 * alteraria nada e não emitiria evento. O par "para a etapa 2" e "para a
 * etapa 3", as duas em "a etapa mudou", alterna de verdade, e então a ÚNICA
 * coisa que segura é a profundidade.
 *
 * Até 2026-11-14 o par era "pôr a tag" e "tirar a tag"; a ação de tag passou a
 * só adicionar (T4 do Bloco Tags), e a tag só cresce — não fecha anel.
 *
 * O que se prova não é "zero execuções" — o encadeamento é desejado, é o que
 * permite um fluxo disparar outro. O que se prova é que ele **para**.
 */

const nome = nomeDeTeste('Anel')

const ids: string[] = []
let leadId: string | null = null
let funilId: string | null = null
let etapa1 = ''
let etapa2 = ''

test.afterAll(async () => {
  const db = banco()
  for (const id of ids) {
    const { data: runs } = await db.from('automation_runs').select('id').eq('automation_id', id)
    for (const r of runs ?? []) await db.from('automation_run_steps').delete().eq('run_id', r.id as string)
    await db.from('automation_runs').delete().eq('automation_id', id)
    await db.from('automations').delete().eq('id', id)
  }
  if (leadId) {
    const { data: l } = await db.from('leads').select('contato_id').eq('id', leadId).maybeSingle()
    await db.from('lead_events').delete().eq('lead_id', leadId)
    await db.from('domain_events').delete().eq('entidade_id', leadId)
    await db.from('leads').delete().eq('id', leadId)
    if (l?.contato_id) await db.from('contacts').delete().eq('id', l.contato_id as string)
  }
  if (funilId) {
    await db.from('crm_stages').delete().eq('funnel_id', funilId)
    await db.from('crm_funnels').delete().eq('id', funilId)
  }
})

/**
 * O preparo fica FORA do teste, e isso não é organização — é orçamento.
 *
 * Este é o primeiro teste da suíte (ordem alfabética) a abrir
 * `/admin/clients/[id]`, uma página pesada. Ele pagava a primeira compilação
 * dela pelo Turbopack **dentro** do próprio limite de tempo, com o dev server
 * disputado por todo o resto: sozinho o teste leva 33s, e dentro da suíte
 * estourou 150s e depois 300s, sempre no `fill` do formulário.
 *
 * `beforeAll` tem orçamento próprio. Compilar a rota aqui tira o custo de onde
 * ele não pertence — o que o teste mede é o motor parar, não o Next compilar.
 */
test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000)

  const db = banco()
  const tenant = await tenantId()

  // Um funil próprio, com três etapas abertas, e o card na primeira.
  const { data: funil, error: eFunil } = await db.from('crm_funnels')
    .insert({ tenant_id: tenant, name: nome, is_default: false, position: 99 }).select('id').single<{ id: string }>()
  expect(eFunil).toBeNull()
  funilId = funil!.id
  const etapas: string[] = []
  for (const [i, n] of ['Um', 'Dois', 'Três'].entries()) {
    const { data } = await db.from('crm_stages').insert({
      tenant_id: tenant, funnel_id: funilId, name: `${nome} ${n}`, color: '#c34d6b', position: i, outcome: 'OPEN',
    }).select('id').single<{ id: string }>()
    etapas.push(data!.id)
  }
  etapa1 = etapas[0]!; etapa2 = etapas[1]!
  const { data: lead, error: eLead } = await db.from('leads').insert({
    tenant_id: tenant, name: nome, phone: '5547' + String(Date.now()).slice(-9), crm_stage_id: etapa1,
  }).select('id').single<{ id: string }>()
  expect(eLead).toBeNull()
  leadId = lead!.id

  // O par: uma leva o card à etapa 2, a outra à 3. As duas assinam o mesmo
  // evento, e a ação de cada uma emite justamente esse evento.
  for (const destino of [etapas[1]!, etapas[2]!]) {
    const { data } = await db.from('automations').insert({
      tenant_id: tenant,
      nome:      `${nome} · ${destino === etapas[1] ? 'para a 2' : 'para a 3'}`,
      status:    'ATIVA',
      gatilhos:  ['lead.etapa_mudou'],
      grafo: {
        nos: [
          { id: 'g1', tipo: 'gatilho.evento', pos: { x: 0, y: 0 },
            config: { evento: 'lead.etapa_mudou' } },
          { id: 'a1', tipo: 'acao.mover_etapa', pos: { x: 260, y: 0 },
            config: { etapaId: destino } },
        ],
        ligacoes: [{ id: 'l1', de: 'g1', para: 'a1' }],
      },
    }).select('id').single()
    ids.push(data!.id as string)
  }

  // A compilação da rota, paga aqui. Sem `waitForLoadState`: o que interessa é
  // o servidor ter compilado, não a página estar interativa.
  const contexto = await browser.newContext()
  const aquecer = await contexto.newPage()
  await aquecer.goto('/admin/oportunidades', { waitUntil: 'commit' })
  await contexto.close()
})

test('duas automações que se alimentam param no teto de profundidade', async ({ page }) => {
  // Este teste ESPERA o motor sossegar: 25s para o anel começar a rodar e até
  // 30s para a contagem parar de mudar. São ~55s só de espera, e o limite
  // padrão da suíte é 60s — sozinho ele cabia, dentro do conjunto (com o dev
  // server dividido com os outros) estourava. O limite é do TESTE, não do
  // motor: o que se prova aqui é que a contagem estabiliza, e ela estabiliza.
  //
  // 150s não bastou: com a suíte em 133 testes ele reprovou em 3 de 5 rodadas
  // completas, sempre no MESMO lugar — o `fill` do formulário do cliente, que
  // era trabalho de TELA, não de motor (o pavio hoje é a action do quadro). Sozinho o teste inteiro leva 35s; sob carga,
  // o dev server (compilando sob demanda e disputando o banco) multiplica isso
  // por 3 ou 4.
  //
  // O preparo (cliente, automações e a COMPILAÇÃO da rota) mudou para o
  // `beforeAll`, que tem orçamento próprio — ver o comentário lá. Aqui sobrou o
  // que o teste de fato mede.
  test.setTimeout(150_000)

  const db = banco()

  // -- O pavio: mover o card, pela action do quadro ---------------------------
  // Tem de passar pelo app: é o emissor que despacha para o motor, e alterar o
  // banco por fora não dispararia nada.
  await chamarAcao(page, 'actions/leads.ts', 'updateLeadStage', '/admin/oportunidades', [leadId, etapa2, ''])

  await expect.poll(async () => {
    const { data } = await db.from('leads').select('crm_stage_id').eq('id', leadId!).single()
    return data?.crm_stage_id
  }, { message: 'o card deveria ter saído da etapa 1' }).not.toBe(etapa1)

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
  // etapa alterna, então nem toda passagem emite evento). O que importa é a
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
    .eq('entidade_id', leadId!).eq('origem', 'automacao')

  expect((daAutomacao ?? []).length, 'as alterações da automação têm origem própria').toBeGreaterThan(0)
  expect(daAutomacao![0]!.ator_nome).toContain('Automação')
})
