import { createHash } from 'node:crypto'
import { test, expect, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D2 da simulação de 2026-10-28: a ficha de saúde do app aceitava "Enviar
 * respostas" sem resposta nenhuma. A clínica ficava com `respostas {}`, e a
 * tela do atendimento mostrava "Anamnese revisada" e "Respondida pela cliente,
 * no app" com os campos vazios. A ficha padrão da rede não tinha nenhum campo
 * obrigatório — nem alergia, nem gestação.
 *
 * Decisões do Heitor:
 *  1. responder (app e link) recusa o envio sem resposta e exige os campos
 *     obrigatórios — no SERVIDOR, não só na tela; a tela diz o que falta;
 *  2. a ficha padrão nasce com alergia, gestação, medicamentos e condições de
 *     saúde obrigatórios (as contraindicações clínicas);
 *  3. a ficha vazia não é "respondida" em lugar nenhum: nem selo no
 *     atendimento, nem a janela de 30 dias que dispensa o próximo envio.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const OBRIGATORIAS = ['allergies', 'isPregnantOrBreastfeeding', 'medications', 'healthConditions']
const COMPLETA = {
  allergies: 'Nenhuma', isPregnantOrBreastfeeding: 'Não', medications: 'Nenhum', healthConditions: 'Nenhuma',
}

let R: OutraRede
let cliente: ClienteDeTeste
let clinica: MembroDeTeste
const slug = () => `e2e-un-po${marca}`
const portal = () => `/${slug()}/cliente`

async function agendar(clienteId: string, emDias = 3): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: R.branchId, client_id: clienteId, procedure_id: R.procedureId, professional_id: R.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() + emDias * 24 * 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}
const pendentes = async (clienteId: string) => (await db().from('pre_atendimentos').select('id, status, modo')
  .eq('client_id', clienteId).eq('status', 'PENDENTE')).data ?? []
const anamnese = async (clienteId: string) => (await db().from('medical_records').select('general_anamnesis')
  .eq('client_id', clienteId).maybeSingle()).data?.general_anamnesis as { respostas?: Record<string, unknown> } | null | undefined

/** Uma ficha pendente nova para a cliente do portal, sem nada de antes (cada teste parte daqui). */
async function abrirFichaPendente(): Promise<void> {
  expect((await db().from('pre_atendimentos').update({ status: 'CANCELADO' }).eq('client_id', cliente.clientId)
    .in('status', ['PENDENTE', 'RESPONDIDO'])).error).toBeNull()
  expect((await db().from('medical_records').update({ general_anamnesis: null }).eq('client_id', cliente.clientId)).error).toBeNull()
  await agendar(cliente.clientId)
  expect(await pendentes(cliente.clientId), 'o agendamento abre a ficha').toHaveLength(1)
}

async function comoCliente<T>(browser: Browser, fn: (page: import('@playwright/test').Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ storageState: cliente.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.describe('a ficha de saúde não se responde vazia (D2)', () => {
  test.beforeAll(async () => {
    R = await criarOutraRede(`po${marca}`)
    expect((await db().from('tenants').update({ pre_atendimento_envio: true }).eq('id', R.tenantId)).error).toBeNull()
    cliente = await clienteComSessao(`poc${marca}`, { id: R.branchId, slug: slug() }, { tenant: R.tenantId })
    clinica = await criarMembro(`pom${marca}`, {
      tenant: R.tenantId, rotulo: 'Profissional',
      permissoes: [
        { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' },
        { modulo: 'medical_records', nivel: 'MANAGE' },
      ],
    })
  })
  test.afterAll(async () => {
    if (R) await db().from('appointments').delete().eq('branch_id', R.branchId)
    await clinica?.limpar(); await cliente?.limpar(); await R?.limpar()
  })

  test('a ficha padrão nasce com alergia, gestação, medicamentos e condições de saúde obrigatórios', async () => {
    const { data } = await db().from('forms').select('schema').eq('tenant_id', R.tenantId).eq('tipo', 'PRE_ATENDIMENTO')
      .single<{ schema: { rows: { fields: { id: string; required?: boolean }[] }[] } }>()
    const campos = data!.schema.rows.flatMap(r => r.fields)
    for (const id of OBRIGATORIAS) expect(campos.find(f => f.id === id)?.required, `${id} obrigatório`).toBe(true)
    for (const id of ['skinType', 'useSunscreen', 'previousProcedures', 'observations']) {
      expect(campos.find(f => f.id === id)?.required ?? false, `${id} continua opcional`).toBe(false)
    }
  })

  /*
   * Revisto pelo Heitor (2026-10-29): a gestação continua obrigatória, mas
   * ganha "Não se aplica" — o cliente do sexo masculino era obrigado a
   * responder Sim ou Não.
   */
  test('a gestação da ficha padrão tem "Sim", "Não" e "Não se aplica", e continua obrigatória', async () => {
    const { data } = await db().from('forms').select('schema').eq('tenant_id', R.tenantId).eq('tipo', 'PRE_ATENDIMENTO')
      .single<{ schema: { rows: { fields: { id: string; required?: boolean; options?: string[] }[] }[] } }>()
    const gestacao = data!.schema.rows.flatMap(r => r.fields).find(f => f.id === 'isPregnantOrBreastfeeding')
    expect(gestacao?.options, 'as três opções, nesta ordem').toEqual(['Sim', 'Não', 'Não se aplica'])
    expect(gestacao?.required, 'continua obrigatória').toBe(true)
  })

  test('na tela do app, a cliente envia a ficha com "Não se aplica" na gestação', async ({ browser }) => {
    await abrirFichaPendente()
    await comoCliente(browser, async page => {
      await page.goto(`${portal()}/pre-atendimento`)
      await page.locator('[data-campo="isPregnantOrBreastfeeding"]').getByLabel('Não se aplica', { exact: true }).check()
      await page.locator('[data-campo="allergies"] textarea').fill('Nenhuma')
      await page.locator('[data-campo="medications"] textarea').fill('Nenhum')
      await page.locator('[data-campo="healthConditions"] textarea').fill('Nenhuma')
      await page.getByRole('button', { name: 'Enviar respostas' }).click()
      await expect(page.getByText('Respostas enviadas')).toBeVisible()
    })
    expect(await pendentes(cliente.clientId), 'respondida, fecha').toHaveLength(0)
    expect((await anamnese(cliente.clientId))?.respostas?.isPregnantOrBreastfeeding, 'grava a resposta como foi dada')
      .toBe('Não se aplica')
  })

  test('no app, o servidor recusa o envio vazio e o que falta obrigatório — e aceita o completo', async ({ browser }) => {
    await abrirFichaPendente()
    await comoCliente(browser, async page => {
      const enviar = (respostas: Record<string, string>) => chamarAcao(page, 'actions/pre-atendimento-cliente.ts',
        'responderPreAtendimento', `${portal()}/pre-atendimento`, [{ respostas }])

      const vazio = await enviar({})
      expect(vazio.texto, 'vazio é recusado').toContain('Responda')
      expect(await pendentes(cliente.clientId), 'a ficha continua pendente').toHaveLength(1)
      expect(await anamnese(cliente.clientId), 'nada vai ao prontuário').toBeFalsy()

      const semObrigatorias = await enviar({ skinType: 'Mista' })
      expect(semObrigatorias.texto, 'diz a primeira obrigatória que falta').toContain('Preencha \\"Grávida ou amamentando?\\"')
      expect(await pendentes(cliente.clientId)).toHaveLength(1)

      const completa = await enviar({ ...COMPLETA, skinType: 'Mista' })
      expect(completa.texto).not.toContain('error')
      expect(await pendentes(cliente.clientId), 'respondida, fecha').toHaveLength(0)
      expect((await anamnese(cliente.clientId))?.respostas).toMatchObject(COMPLETA)
    })
  })

  test('na tela do app, "Enviar respostas" vazio diz o que falta e não envia', async ({ browser }) => {
    await abrirFichaPendente()
    await comoCliente(browser, async page => {
      await page.goto(`${portal()}/pre-atendimento`)
      await page.getByRole('button', { name: 'Enviar respostas' }).click()
      await expect(page.locator('[data-campo="isPregnantOrBreastfeeding"]')).toHaveAttribute('data-invalido', 'true')
      await expect(page.getByText('Respostas enviadas')).toHaveCount(0)
    })
    expect(await pendentes(cliente.clientId), 'nada foi enviado').toHaveLength(1)
  })

  test('pelo link, o envio vazio também é recusado', async ({ browser }) => {
    await abrirFichaPendente()
    const cpf = '52998224725'
    expect((await db().from('clients').update({ document: cpf }).eq('id', cliente.clientId)).error).toBeNull()
    const ag = (await db().from('pre_atendimentos').select('appointment_id').eq('client_id', cliente.clientId)
      .eq('status', 'PENDENTE').single<{ appointment_id: string }>()).data!.appointment_id
    const ctx = await browser.newContext({ storageState: clinica.estado })
    let token = ''
    try {
      const page = await ctx.newPage()
      const r = await chamarAcao(page, 'actions/pre-atendimento.ts', 'gerarLinkDoPreAtendimento', '/admin/agenda', [ag])
      token = /\/pre-atendimento\/([A-Za-z0-9_-]{43})/.exec(r.texto)?.[1] ?? ''
    } finally {
      await ctx.close()
    }
    expect(token, 'o link foi gerado').not.toBe('')
    expect((await db().from('pre_atendimento_links').select('token_hash').eq('token_hash', createHash('sha256').update(token).digest('hex'))).data).toHaveLength(1)

    const publico = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const r = await publico.request.post('/api/pre-atendimento/responder', {
        data: { token, cpf, respostas: {} }, headers: { 'x-real-ip': `198.51.100.${10 + Math.floor(Math.random() * 200)}` },
      })
      expect(r.status(), 'recusado').toBe(400)
      expect((await r.json()).erro).toContain('Responda')
    } finally {
      await publico.close()
    }
    expect(await pendentes(cliente.clientId), 'continua pendente').toHaveLength(1)
  })

  /** Como a simulação deixou: a cliente "respondeu" vazio pelo app há 5 dias. */
  async function clienteComFichaVazia(rotulo: string): Promise<string> {
    const outra = await R.criarCliente(rotulo)
    const ha5 = new Date(Date.now() - 5 * 86_400_000).toISOString()
    expect((await db().from('medical_records').upsert({
      client_id: outra,
      general_anamnesis: { versao: 2, ficha: { formId: null, nome: 'Pré-atendimento', rows: [] }, respostas: {}, respondidoEm: ha5, origem: 'CLIENTE_APP', respondidoPor: null },
    }, { onConflict: 'client_id' })).error).toBeNull()
    expect((await db().from('pre_atendimentos').insert({
      tenant_id: R.tenantId, client_id: outra, status: 'RESPONDIDO', modo: 'COMPLETO',
      ficha: { formId: null, nome: 'Pré-atendimento', rows: [] }, respostas: {}, respondido_em: ha5, origem: 'CLIENTE_APP',
    })).error).toBeNull()
    return outra
  }

  test('a ficha gravada vazia não dispensa o envio: o próximo agendamento pede a ficha inteira', async () => {
    const outra = await clienteComFichaVazia('Vazia envio')
    await agendar(outra, 2)
    expect(await pendentes(outra)).toEqual([expect.objectContaining({ modo: 'COMPLETO' })])
  })

  test('a ficha gravada vazia não é "respondida" no atendimento: sem selo, e a tela diz que está vazia', async ({ browser }) => {
    const outra = await clienteComFichaVazia('Vazia tela')
    const ag = await agendar(outra, 2)
    const ctx = await browser.newContext({ storageState: clinica.estado })
    try {
      const page = await ctx.newPage()
      await page.goto(`/admin/agenda/${ag}`)
      await expect(page.locator('[data-anamnese-geral]').first()).toBeVisible()
      await expect(page.getByText('Anamnese revisada'), 'sem o selo de revisada').toHaveCount(0)
      await expect(page.getByText(/Respondida pela cliente/), 'sem "respondida"').toHaveCount(0)
      await expect(page.getByText('Ficha de saúde vazia', { exact: false }).first(), 'a tela diz que está vazia').toBeVisible()
    } finally {
      await ctx.close()
    }
  })
})
