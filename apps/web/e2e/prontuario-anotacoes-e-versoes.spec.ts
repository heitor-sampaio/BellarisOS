import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Bloco Prontuário do plano de adaptação (a revisão do Heitor, 2026-11-13:
 * PR2, "o registro concluído não se reescreve sem rastro").
 *
 * PR2a — a anotação depois do atendimento: no atendimento concluído,
 * "Acrescentar anotação" (o Prontuário em Gerenciar, com o alcance de hoje)
 * grava um texto datado com o nome de quem escreveu (o do ctx), que não se
 * edita nem se apaga. Aparece no atendimento e na aba Prontuário.
 *
 * PR2b — a correção guarda a versão de antes: o "Editar registro" grava, antes
 * de trocar, o que estava (evolução, intercorrência, ficha do procedimento),
 * com quem e quando; o atendimento diz "Editado por X em dd/mm — ver a
 * anterior". Só o servidor grava; a versão não se altera (gatilho).
 *
 * PR2c — o pacote LGPD leva as anotações e as versões.
 *
 * Numa rede [e2e] própria.
 */

// Os blocos dependem uns dos outros (a anotação e a versão vão ao pacote LGPD).
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const comToken = (t: string): SupabaseClient => createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${t}` } } })

let rede: OutraRede | null = null
let outra: OutraRede | null = null
let dona: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let nomeDaDona = ''
let slug = ''
let cliente = ''
let atendimento = ''
let emAndamento = ''
let daOutraRede = ''
const EVOLUCAO_ANTES = `Evolução original ${marca}`
const INTERC_ANTES = `Intercorrência original ${marca}`

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const anotacoes = async (ag: string) => (await db().from('prontuario_anotacoes').select('id, texto, autor_nome, tenant_id, client_id').eq('appointment_id', ag).order('criada_em')).data ?? []
const versoes = async (ag: string) => (await db().from('prontuario_versoes').select('id, evolucao, intercorrencias, ficha, editada_por_nome').eq('appointment_id', ag).order('substituida_em')).data ?? []

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pav${marca}`)
  outra = await criarOutraRede(`pavo${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`pavd${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  nomeDaDona = (await db().from('users').select('name').eq('id', dona.userId).single<{ name: string }>()).data!.name
  soVe = await criarMembro(`pavv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê o prontuário',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  // A ficha do procedimento, com uma pergunta de texto.
  const rows = [{ id: 'r1', fields: [{ id: 'obs', type: 'text', label: 'Observação da ficha' }] }]
  const { data: form, error: eF } = await db().from('forms').insert({ tenant_id: rede.tenantId, name: `Ficha ${marca}`, is_active: true, schema: { rows }, tipo: 'PROCEDIMENTO' }).select('id').single<{ id: string }>()
  expect(eF).toBeNull()
  expect((await db().from('procedures').update({ form_id: form!.id }).eq('id', rede.procedureId)).error).toBeNull()

  cliente = await rede.criarCliente('Helena')
  const base = { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId, source: 'INTERNAL', duration_min: 30, price: 0 }
  const { data: ag, error } = await db().from('appointments').insert({
    ...base, status: 'COMPLETED', scheduled_at: new Date(Date.now() - 26 * 3600_000).toISOString(), completed_at: new Date(Date.now() - 25 * 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  atendimento = ag!.id
  const { data: and } = await db().from('appointments').insert({
    ...base, status: 'IN_PROGRESS', scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  emAndamento = and!.id
  const { data: pr } = await db().from('medical_records').insert({ client_id: cliente }).select('id').single<{ id: string }>()
  expect((await db().from('medical_record_entries').insert({
    medical_record_id: pr!.id, appointment_id: atendimento, professional_id: rede.professionalId,
    notes: EVOLUCAO_ANTES, intercurrences: INTERC_ANTES,
    form_data: { ficha: { formId: form!.id, name: `Ficha ${marca}`, rows, answers: { obs: 'resposta de antes' } } },
  })).error).toBeNull()

  const clienteDaOutra = await outra.criarCliente('Outra')
  const { data: agO } = await db().from('appointments').insert({
    branch_id: outra.branchId, client_id: clienteDaOutra, procedure_id: outra.procedureId, professional_id: outra.professionalId,
    source: 'INTERNAL', duration_min: 30, price: 0, status: 'COMPLETED',
    scheduled_at: new Date(Date.now() - 26 * 3600_000).toISOString(), completed_at: new Date(Date.now() - 25 * 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  daOutraRede = agO!.id
})
test.afterAll(async () => {
  await db().from('lgpd_requests').delete().eq('client_id', cliente)
  await dona?.limpar(); await soVe?.limpar(); await rede?.limpar(); await outra?.limpar()
})

test.describe.serial('PR2a: a anotação depois do atendimento', () => {
  const TEXTO = `A cliente ligou três dias depois com vermelhidão ${marca}`

  test('no atendimento concluído, "Acrescentar anotação" grava o texto com o nome de quem escreveu', async ({ browser }) => {
    await como(dona!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      const bloco = p.locator('[data-anotacoes-do-atendimento]')
      await bloco.getByRole('button', { name: 'Acrescentar anotação' }).click()
      await bloco.getByLabel('Anotação').fill(TEXTO)
      await bloco.getByRole('button', { name: 'Salvar anotação' }).click()
      await expect.poll(async () => (await anotacoes(atendimento)).length).toBe(1)
      await expect(bloco.getByText(TEXTO)).toBeVisible()
      await expect(bloco.getByText(nomeDaDona)).toBeVisible()
      // Não se edita nem se apaga: nenhum botão para isso.
      await expect(bloco.getByRole('button', { name: /Editar|Excluir|Apagar/ })).toHaveCount(0)
    })
    const [a] = await anotacoes(atendimento)
    expect(a).toMatchObject({ texto: TEXTO, autor_nome: nomeDaDona, tenant_id: rede!.tenantId, client_id: cliente })
  })

  test('a anotação aparece na aba Prontuário, no atendimento dela', async ({ browser }) => {
    await como(dona!, browser, async p => {
      await p.goto(`/admin/clients/${cliente}?aba=fichas`)
      const registro = p.locator(`[data-registro-do-atendimento="${atendimento}"]`)
      await expect(registro.locator('[data-anotacoes-do-atendimento]').getByText(TEXTO)).toBeVisible()
    })
  })

  test('a anotação não se altera nem se apaga, nem pelo servidor (gatilho)', async () => {
    const [a] = await anotacoes(atendimento)
    const upd = await db().from('prontuario_anotacoes').update({ texto: 'trocado' }).eq('id', a!.id).select('id')
    expect(upd.error?.message ?? '').toMatch(/não se altera/)
    const del = await db().from('prontuario_anotacoes').delete().eq('id', a!.id).select('id')
    expect(del.error?.message ?? '').toMatch(/não se altera/)
    expect((await anotacoes(atendimento))[0]!.texto).toBe(TEXTO)
  })

  test('as recusas: quem só vê, o atendimento não concluído e o de outra rede (o admin é o controle)', async ({ browser }) => {
    const rota = `/${slug}/agenda/${atendimento}`
    await como(soVe!, browser, async p => {
      await chamarAcao(p, 'actions/prontuario.ts', 'acrescentarAnotacao', rota, [atendimento, 'de quem só vê'])
    })
    await como(dona!, browser, async p => {
      await chamarAcao(p, 'actions/prontuario.ts', 'acrescentarAnotacao', rota, [emAndamento, 'no atendimento em andamento'])
      await chamarAcao(p, 'actions/prontuario.ts', 'acrescentarAnotacao', rota, [daOutraRede, 'na outra rede'])
      await chamarAcao(p, 'actions/prontuario.ts', 'acrescentarAnotacao', rota, [atendimento, '   '])
    })
    expect((await anotacoes(atendimento)).map(a => a.texto)).toEqual([TEXTO])
    expect(await anotacoes(emAndamento)).toEqual([])
    expect(await anotacoes(daOutraRede)).toEqual([])
    // Controle: a mesma chamada, de quem pode, grava.
    await como(dona!, browser, async p => {
      await chamarAcao(p, 'actions/prontuario.ts', 'acrescentarAnotacao', rota, [atendimento, `Pela ação ${marca}`])
    })
    expect((await anotacoes(atendimento)).map(a => a.texto)).toEqual([TEXTO, `Pela ação ${marca}`])
  })
})

test.describe.serial('PR2b: a correção guarda a versão de antes', () => {
  const EVOLUCAO_NOVA = `Evolução corrigida ${marca}`

  test('"Editar registro" e salvar grava a versão de antes, com quem e quando; o atendimento diz "Editado por"', async ({ browser }) => {
    await como(dona!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      await p.getByRole('button', { name: 'Editar registro' }).click()
      await p.getByLabel('Evolução', { exact: true }).fill(EVOLUCAO_NOVA)
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect.poll(async () => (await db().from('medical_record_entries').select('notes').eq('appointment_id', atendimento).single()).data?.notes).toBe(EVOLUCAO_NOVA)
      await p.reload()
      const editado = p.locator('[data-registro-editado]')
      await expect(editado).toContainText(`Editado por ${nomeDaDona} em`)
      await editado.getByRole('button', { name: 'ver a anterior' }).click()
      await expect(p.locator('[data-versao-anterior]').getByText(EVOLUCAO_ANTES)).toBeVisible()
    })
    const vs = await versoes(atendimento)
    expect(vs).toHaveLength(1)
    expect(vs[0]).toMatchObject({ evolucao: EVOLUCAO_ANTES, intercorrencias: INTERC_ANTES, editada_por_nome: nomeDaDona })
    expect((vs[0]!.ficha as { answers?: { obs?: string } } | null)?.answers?.obs).toBe('resposta de antes')
  })

  test('a ficha do procedimento corrigida também guarda a de antes; salvar sem mudar nada não cria versão', async ({ browser }) => {
    const rota = `/${slug}/agenda/${atendimento}`
    await como(dona!, browser, async p => {
      const r = await chamarAcao(p, 'actions/anamnesis.ts', 'salvarFichaDoProcedimento', rota, [{ appointmentId: atendimento, slug, answers: { obs: 'resposta corrigida' } }])
      expect(r.texto).toContain('"ok":true')
    })
    const vs = await versoes(atendimento)
    expect(vs).toHaveLength(2)
    expect((vs[1]!.ficha as { answers?: { obs?: string } }).answers?.obs).toBe('resposta de antes')
    expect(vs[1]!.evolucao).toBe(EVOLUCAO_NOVA)
    // De novo, igual: nada mudou, nada se guarda.
    await como(dona!, browser, async p => {
      await chamarAcao(p, 'actions/anamnesis.ts', 'salvarFichaDoProcedimento', rota, [{ appointmentId: atendimento, slug, answers: { obs: 'resposta corrigida' } }])
    })
    expect(await versoes(atendimento)).toHaveLength(2)
  })

  test('a versão não se altera nem se apaga (gatilho)', async () => {
    const [v] = await versoes(atendimento)
    const upd = await db().from('prontuario_versoes').update({ evolucao: 'trocado' }).eq('id', v!.id).select('id')
    expect(upd.error?.message ?? '').toMatch(/não se altera/)
    const del = await db().from('prontuario_versoes').delete().eq('id', v!.id).select('id')
    expect(del.error?.message ?? '').toMatch(/não se altera/)
  })

  test('a sessão não lê nem grava anotações e versões pela chave pública (só o servidor)', async () => {
    const sessao = comToken(dona!.accessToken)
    for (const tabela of ['prontuario_anotacoes', 'prontuario_versoes']) {
      const lido = await sessao.from(tabela).select('id').eq('appointment_id', atendimento)
      expect(lido.data ?? [], `${tabela}: a sessão não lê`).toEqual([])
    }
    const ins = await sessao.from('prontuario_anotacoes').insert({
      tenant_id: rede!.tenantId, client_id: cliente, appointment_id: atendimento, texto: 'pela chave', autor_nome: 'x',
    })
    expect(ins.error, 'a sessão não grava').not.toBeNull()
    // Controle: a mesma sessão lê o que pode (o atendimento da própria rede).
    const controle = await sessao.from('appointments').select('id').eq('id', atendimento)
    expect(controle.data?.length).toBe(1)
  })
})

test('PR2c: o pacote LGPD leva as anotações e as versões de antes', async ({ browser }) => {
  test.setTimeout(120_000)
  await como(dona!, browser, async p => {
    const r = await chamarAcao(p, 'actions/lgpd.ts', 'exportarDadosPelaEquipe', `/admin/clients/${cliente}`, [cliente, { incluirProntuario: true }])
    expect(r.texto).toContain('"ok":true')
  })
  let caminho = ''
  await expect.poll(async () => {
    const { data } = await db().from('lgpd_requests').select('status, export_json_path').eq('client_id', cliente).maybeSingle()
    caminho = (data?.export_json_path as string | null) ?? ''
    return data?.status
  }, { timeout: 60_000 }).toBe('completed')
  const { data: url } = await db().storage.from('lgpd-exports').createSignedUrl(caminho, 60)
  type Atendimento = { anotacoes?: { texto: string; por: string }[]; versoesAnteriores?: { evolucao: string | null; por: string }[] }
  const pacote = await (await fetch(url!.signedUrl)).json() as { prontuario: { atendimentos: Atendimento[] } }
  const comAnotacao = pacote.prontuario.atendimentos.find(a => (a.anotacoes ?? []).length > 0)
  expect(comAnotacao?.anotacoes?.map(a => a.texto)).toEqual([`A cliente ligou três dias depois com vermelhidão ${marca}`, `Pela ação ${marca}`])
  expect(comAnotacao?.anotacoes?.[0]?.por).toBe(nomeDaDona)
  expect(comAnotacao?.versoesAnteriores?.map(v => v.evolucao)).toEqual([EVOLUCAO_ANTES, `Evolução corrigida ${marca}`])
})
