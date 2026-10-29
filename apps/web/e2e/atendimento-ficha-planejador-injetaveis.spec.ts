import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { chamarAcao } from './apoio/acao-direta'
import { responderAnamnese } from './apoio/anamnese'

/**
 * O planejador de injetáveis da ficha do procedimento (pedido do Heitor,
 * 2026-10-29): "precisa incluir lá na ficha o planejador dos injetáveis, onde
 * pode abrir um planejamento já feito ou criar um do zero".
 *
 * O campo "Planejador de injetáveis" era um mapa SOLTO: os pontos ficavam só
 * na resposta da ficha, sem ligação com os planejamentos da cliente. Agora,
 * no atendimento, ele é a porta para o planejador de verdade — lista os
 * planejamentos da cliente, cria um novo ligado a ela e abre o MESMO
 * planejador de Planejamento → Injetáveis, com o "Registrar aplicação". A
 * ficha guarda o id do planejamento usado e um RETRATO dos pontos de quando
 * foi salva ou o atendimento finalizado (na transação da conclusão).
 *
 * A profissional tem a agenda e o prontuário "só os meus": o plano é da
 * cliente, e quem a atende vê os planejamentos dela.
 */

const marca = Date.now().toString(36)
const db = () => banco()

const FICHA = `Ficha de toxina ${marca}`
const NOME_DO_MAPA = `Toxina terço superior ${marca}`
const PONTOS = [
  { id: 'p1', x: 0.42, y: 0.28, product: 'Toxina botulínica', dose: 4, unit: 'UI', applied: null, view: 'rosto_f' },
  { id: 'p2', x: 0.58, y: 0.28, product: 'Toxina botulínica', dose: 4, unit: 'UI', applied: null, view: 'rosto_f' },
]
const RECUSA = 'Planejamento de injetáveis não encontrado para esta cliente.'

let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let fichaId = ''
const clientes: string[] = []

/** O que o caso 1 deixa para o caso da leitura na ficha da cliente. */
let clienteComMapa = ''
let mapaExistente = ''

test.describe.configure({ mode: 'serial', timeout: 120_000 })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`fpi${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: ficha, error } = await db().from('forms').insert({
    tenant_id: rede.tenantId, name: FICHA, is_active: true, tipo: 'PROCEDIMENTO',
    schema: { rows: [
      { id: 'r1', fields: [{ id: 'regiao', type: 'text', label: 'Região tratada' }] },
      { id: 'r2', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Planejador de injetáveis', options: ['Toxina botulínica'] }] },
    ] },
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  fichaId = ficha!.id
  expect((await db().from('procedures').update({ name: `[e2e] Toxina ${marca}`, form_id: fichaId, price: 0 })
    .eq('id', rede.procedureId)).error).toBeNull()
  profissional = await criarMembro(`fpip${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})

test.afterAll(async () => {
  if (!rede) return
  if (clientes.length) await db().from('injectable_applications').delete().in('client_id', clientes)
  await db().from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
  const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
  const falhas = await apagarAgendamentos((ags ?? []).map(a => a.id as string))
  expect(falhas, 'a limpeza tem de apagar tudo').toEqual([])
  await db().from('procedures').update({ form_id: null }).eq('id', rede.procedureId)
  if (fichaId) await db().from('forms').delete().eq('id', fichaId)
  await profissional?.limpar()
  await rede.limpar()
})

async function cliente(rotulo: string): Promise<string> {
  const id = await rede!.criarCliente(rotulo)
  clientes.push(id)
  // A ficha de saúde respondida (as obrigatórias): desde a revisão do Heitor de
  // 2026-10-29, a obrigatória sem resposta barra o "Finalizar atendimento".
  await responderAnamnese(id, rede!.tenantId)
  return id
}

async function mapaDa(clientId: string, nome: string, pontos: unknown[] = PONTOS): Promise<string> {
  const { data, error } = await db().from('injectable_maps').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: clientId, name: `[e2e] ${nome}`, view: 'rosto_f', points: pontos,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

async function atendimentoEmCurso(clientId: string, status = 'IN_PROGRESS'): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status, source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    ...(status === 'COMPLETED' ? { completed_at: new Date().toISOString() } : {}),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function finalizar(p: Page, id: string) {
  await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
  await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
  await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single()).data?.status).toBe('COMPLETED')
}

type RespostaDoMapa = {
  planejamento?: { id: string; nome: string }
  points?: { id: string; dose: number }[]
  retratoEm?: string
}

async function mapaNaFicha(id: string): Promise<RespostaDoMapa | null> {
  const { data, error } = await db().from('medical_record_entries').select('form_data').eq('appointment_id', id).maybeSingle()
  expect(error).toBeNull()
  const ficha = (data?.form_data as { ficha?: { formId: string; answers: Record<string, unknown> } } | null)?.ficha
  return (ficha?.answers?.mapa as RespostaDoMapa | undefined) ?? null
}

test('abre pelo campo o planejamento que a cliente já tem, registra a aplicação e o "Finalizar" guarda o retrato', async ({ browser }) => {
  clienteComMapa = await cliente('Com mapa')
  mapaExistente = await mapaDa(clienteComMapa, NOME_DO_MAPA)
  const id = await atendimentoEmCurso(clienteComMapa)

  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const campo = p.locator('[data-campo="mapa"]')
    // O campo lista os planejamentos DA CLIENTE (não um mapa em branco).
    await campo.getByText(NOME_DO_MAPA).click()
    // O mesmo planejador do Planejamento → Injetáveis: os pontos dele, e o
    // "Registrar aplicação" porque está dentro do atendimento.
    await expect(campo.getByRole('heading', { name: `[e2e] ${NOME_DO_MAPA}` })).toBeVisible()
    await campo.getByRole('button', { name: 'Registrar aplicação' }).click()
    await expect(campo.getByText('Aplicação registrada neste atendimento.')).toBeVisible()
    await finalizar(p, id)
  })

  const mapa = await mapaNaFicha(id)
  expect(mapa, 'a ficha guarda o planejamento usado').not.toBeNull()
  expect(mapa!.planejamento).toEqual({ id: mapaExistente, nome: `[e2e] ${NOME_DO_MAPA}` })
  expect(mapa!.points, 'o retrato dos pontos do planejamento').toEqual(PONTOS)
  expect(mapa!.retratoEm).toBeTruthy()

  const { data: aplicacoes } = await db().from('injectable_applications').select('appointment_id, map_id').eq('client_id', clienteComMapa)
  expect(aplicacoes, 'a aplicação fica ligada ao atendimento').toEqual([{ appointment_id: id, map_id: mapaExistente }])

  // O retrato é DAQUELE dia: o planejamento mudar depois não mexe no prontuário.
  expect((await db().from('injectable_maps').update({ points: [] }).eq('id', mapaExistente)).error).toBeNull()
  expect((await mapaNaFicha(id))!.points).toEqual(PONTOS)
  expect((await db().from('injectable_maps').update({ points: PONTOS }).eq('id', mapaExistente)).error).toBeNull()
})

test('cria pelo campo um planejamento novo, ligado à cliente; salvar a ficha e finalizar retratam o planejamento salvo', async ({ browser }) => {
  const nova = await cliente('Sem mapa')
  const id = await atendimentoEmCurso(nova)

  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const campo = p.locator('[data-campo="mapa"]')
    await expect(campo.getByText('Nenhum planejamento de injetáveis ainda.')).toBeVisible()
    await campo.getByRole('button', { name: 'Novo planejamento' }).click()
    const ilustracao = campo.locator('svg:has(image)')
    await expect(ilustracao).toBeVisible()
    await ilustracao.click({ position: { x: 120, y: 90 } })
    await campo.getByRole('button', { name: 'Salvar planejamento' }).click()
    await expect(campo.getByText('Planejamento salvo.')).toBeVisible()
    await p.getByRole('button', { name: 'Salvar ficha' }).click()
    await expect(p.getByText('Salvo', { exact: true })).toBeVisible()

    const { data: criados } = await db().from('injectable_maps').select('id, client_id').eq('client_id', nova)
    expect(criados, 'o planejamento novo nasce ligado à cliente').toHaveLength(1)
    const salvo = await mapaNaFicha(id)
    expect(salvo?.planejamento?.id, '"Salvar ficha" guarda o planejamento usado').toBe(criados![0]!.id)
    expect(salvo?.points, 'e o retrato do que estava salvo nele').toHaveLength(1)

    // Mais um ponto depois de salvar a ficha: o "Finalizar" retrata de novo.
    await ilustracao.click({ position: { x: 160, y: 90 } })
    await campo.getByRole('button', { name: 'Salvar planejamento' }).click()
    await expect(campo.getByText('Planejamento salvo.')).toBeVisible()
    await finalizar(p, id)
  })

  const mapa = await mapaNaFicha(id)
  expect(mapa?.points, 'o retrato é o do planejamento ao finalizar').toHaveLength(2)
})

test('o endpoint recusa retratar o planejamento de OUTRA cliente pelo id', async ({ browser }) => {
  const atendida = await cliente('Atendida')
  const outra = await cliente('Outra')
  const daAtendida = await mapaDa(atendida, `Mapa da atendida ${marca}`)
  const daOutra = await mapaDa(outra, `Mapa da outra ${marca}`)
  const id = await atendimentoEmCurso(atendida)
  const rota = `/${slug}/agenda/${id}`
  const resposta = (mapId: string) => ({ regiao: 'Glabela', mapa: { view: 'rosto_f', points: [], planejamento: { id: mapId, nome: '' } } })

  await como(browser, async p => {
    const recusada = await chamarAcao(p, 'actions/anamnesis.ts', 'salvarFichaDoProcedimento', rota,
      [{ appointmentId: id, slug, answers: resposta(daOutra) }])
    expect(recusada.texto).toContain(RECUSA)
    expect(await mapaNaFicha(id), 'nada foi gravado').toBeNull()

    // Controle: o planejamento da própria cliente passa, com o retrato do gravado.
    const aceita = await chamarAcao(p, 'actions/anamnesis.ts', 'salvarFichaDoProcedimento', rota,
      [{ appointmentId: id, slug, answers: resposta(daAtendida) }])
    expect(aceita.texto).not.toContain(RECUSA)
  })
  const mapa = await mapaNaFicha(id)
  expect(mapa?.planejamento?.id).toBe(daAtendida)
  expect(mapa?.points).toEqual(PONTOS)
})

test('na ficha da cliente, o retrato se lê e leva ao planejamento; a ficha antiga, de mapa solto, continua como está', async ({ browser }) => {
  test.skip(!clienteComMapa, 'depende do primeiro caso')
  // Uma ficha de antes: o mapa solto, só na resposta.
  const antigo = await atendimentoEmCurso(clienteComMapa, 'COMPLETED')
  const { data: prontuario } = await db().from('medical_records').select('id').eq('client_id', clienteComMapa).single<{ id: string }>()
  expect((await db().from('medical_record_entries').insert({
    medical_record_id: prontuario!.id, appointment_id: antigo, professional_id: profissional!.userId,
    created_at: new Date(Date.now() - 86_400_000 * 30).toISOString(),
    form_data: { ficha: {
      formId: fichaId, name: FICHA,
      rows: [{ id: 'r2', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Planejador de injetáveis', options: ['Toxina botulínica'] }] }],
      answers: { mapa: { view: 'rosto_f', points: [PONTOS[0]], confirmedAt: null } },
    } },
  })).error).toBeNull()

  await como(browser, async p => {
    await p.goto(`/${slug}/clients/${clienteComMapa}?aba=fichas`)
    const doPlanejamento = p.locator('[data-retrato-do-planejamento]')
    await expect(doPlanejamento).toHaveCount(1)
    await expect(doPlanejamento.getByText(`[e2e] ${NOME_DO_MAPA}`)).toBeVisible()
    await expect(doPlanejamento.getByText('2 pontos marcados', { exact: false })).toBeVisible()
    // A ficha antiga: o mapa solto, em leitura, como era.
    await expect(p.getByText('1 ponto marcado', { exact: false })).toBeVisible()
    // Fora do atendimento, nada de confirmar ou registrar aplicação.
    await expect(p.getByRole('button', { name: 'Confirmar aplicação' })).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Registrar aplicação' })).toHaveCount(0)

    const abrir = doPlanejamento.getByRole('link', { name: 'Abrir planejamento' })
    await expect(abrir).toHaveAttribute('href', new RegExp(`aberto=${mapaExistente}`))
    await abrir.click()
    await expect(p.getByRole('heading', { name: `[e2e] ${NOME_DO_MAPA}` })).toBeVisible()
  })
})
