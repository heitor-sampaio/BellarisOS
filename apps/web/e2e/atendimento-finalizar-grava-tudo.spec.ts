import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

/**
 * D3 da simulação de 2026-10-28: as "Dores do cliente" e a anamnese digitadas
 * no atendimento ("Nega alergias. Nega isotretinoína. Não está grávida.") não
 * chegavam ao prontuário quando a profissional encerrava por "Finalizar
 * atendimento" — só o "Enviar para a recepção" (que exige plano) as mandava.
 * E recarregar a página apagava as dores, a anamnese e a dose do insumo (o
 * rascunho da A31 guardava só a evolução).
 *
 * Decisão do Heitor: "Finalizar" grava dores e anamnese junto com a evolução,
 * NA MESMA transação da conclusão (`concluir_atendimento`); o rascunho guarda
 * também as dores, a anamnese e a dose do insumo.
 *
 * E o A17 (mesmo trecho): a observação interna do agendamento aparecia como
 * "Dores do cliente". A dor nasce vazia, e a observação fica à mostra como
 * observação.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let produto = ''
const OBSERVACAO = `Prefere horário da manhã ${marca}`
const DORES = `Manchas na testa e linhas de expressão ${marca}`
const ALERGIA = `Nega alergias ${marca}`
const EVOLUCAO = `Toxina em glabela, 20 UI ${marca}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/**
 * A cliente já chega com a ficha de saúde respondida (as obrigatórias): desde a
 * revisão do Heitor de 2026-10-29, a obrigatória sem resposta barra o
 * "Finalizar" — e o que se prova aqui é o que a tela leva, não a trava
 * (`atendimento-obrigatorias-barram.spec.ts`).
 */
async function atendimentoEmCurso(rotulo: string, extra: Record<string, unknown> = {}): Promise<{ id: string; cliente: string; respostas: Record<string, string | string[]> }> {
  const cliente = await rede!.criarCliente(rotulo)
  const respostas = await responderAnamnese(cliente, rede!.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    ...extra,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente, respostas }
}

const dores = (p: Page) => p.getByPlaceholder('Anote o que o cliente relatou: queixas estéticas, objetivos, histórico de tratamentos anteriores…')
const alergia = (p: Page) => p.locator('[data-anamnese-geral] [data-campo="allergies"] textarea')
const evolucao = (p: Page) => p.getByPlaceholder('Técnicas utilizadas, regiões tratadas, evolução do cliente…')
const dose = (p: Page) => p.locator('input[type="number"][step="0.001"]').first()

async function finalizar(p: Page, id: string) {
  await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
  await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
  await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single()).data?.status).toBe('COMPLETED')
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fg${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`fgp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  // A toxina pede 30 UI do frasco; a unidade tem estoque.
  produto = await rede.criarProduto('Toxina', 500)
  expect((await db().from('procedure_products').insert({ procedure_id: rede.procedureId, product_id: produto, quantity: 30 })).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) {
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
    await db().from('procedure_products').delete().eq('procedure_id', rede.procedureId)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('a observação interna do agendamento não vira "Dores do cliente": fica à mostra como observação (A17)', async ({ browser }) => {
  const { id } = await atendimentoEmCurso('Observacao', { notes: OBSERVACAO })
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(dores(p), 'a dor nasce vazia: a observação interna não é queixa').toHaveValue('')
    await expect(p.getByText(OBSERVACAO), 'a observação interna fica à mostra, como observação').toBeVisible()
  })
})

test('"Finalizar" grava as dores e a anamnese junto com a evolução, sem mexer na observação interna', async ({ browser }) => {
  const { id, cliente } = await atendimentoEmCurso('Finalizar', { notes: OBSERVACAO })
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await dores(p).fill(DORES)
    await alergia(p).fill(ALERGIA)
    await evolucao(p).fill(EVOLUCAO)
    await finalizar(p, id)
  })
  const { data: entrada } = await db().from('medical_record_entries').select('*').eq('appointment_id', id).single()
  expect(entrada?.notes, 'a evolução').toBe(EVOLUCAO)
  expect((entrada as Record<string, unknown> | null)?.queixas, 'as dores vão ao prontuário do atendimento').toBe(DORES)
  const { data: mr } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
  expect(mr?.general_anamnesis, 'a anamnese digitada vai à ficha da cliente').toMatchObject({ versao: 2, origem: 'EQUIPE', respostas: { allergies: ALERGIA } })
  const { data: ag } = await db().from('appointments').select('notes').eq('id', id).single()
  expect(ag?.notes, 'a observação interna continua a mesma').toBe(OBSERVACAO)
})

test('recarregar não perde as dores, a anamnese nem a dose do insumo — e a dose ajustada é a que baixa', async ({ browser }) => {
  const { id } = await atendimentoEmCurso('Recarregar')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await dores(p).fill(DORES)
    await alergia(p).fill(ALERGIA)
    await dose(p).fill('32')
    await dose(p).press('Tab')

    await p.reload()
    await expect(dores(p)).toHaveValue(DORES)
    await expect(alergia(p)).toHaveValue(ALERGIA)
    await expect(dose(p)).toHaveValue('32')
    const guardado = await p.evaluate(() => ({ sessao: JSON.stringify({ ...sessionStorage }), local: JSON.stringify({ ...localStorage }) }))
    expect(guardado.sessao).toContain(DORES)
    expect(guardado.local, 'texto clínico não fica na máquina').not.toContain(DORES)

    await finalizar(p, id)
    await expect.poll(() => p.evaluate(() => JSON.stringify({ ...sessionStorage })), { message: 'finalizar apaga o rascunho' }).not.toContain(DORES)
  })
  const { data: mov } = await db().from('stock_movements').select('quantity').eq('appointment_id', id).eq('product_id', produto)
  expect(mov?.map(m => Number(m.quantity)), 'baixa a dose da tela, não a do cadastro').toEqual([-32])
})

test('a anamnese que a cliente respondeu, sem ninguém mexer, não vira "pela equipe" ao finalizar', async ({ browser }) => {
  const { id, cliente, respostas } = await atendimentoEmCurso('Intacta')
  const respondidoEm = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const daCliente = {
    versao: 2, ficha: { formId: null, nome: 'Pré-atendimento', rows: [] },
    respostas: { ...respostas, allergies: `dipirona ${marca}` }, respondidoEm, origem: 'CLIENTE_APP', respondidoPor: null,
  }
  expect((await db().from('medical_records').upsert({ client_id: cliente, general_anamnesis: daCliente }, { onConflict: 'client_id' })).error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(alergia(p)).toHaveValue(`dipirona ${marca}`)
    await evolucao(p).fill(EVOLUCAO)
    await finalizar(p, id)
  })
  const { data: mr } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
  expect(mr?.general_anamnesis).toMatchObject({ origem: 'CLIENTE_APP', respondidoEm })
})
