import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { responderAnamnese } from './apoio/anamnese'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * D1 da simulação de 2026-10-29: a dona ligou a "Ficha de peeling" (fototipo,
 * ácido, tempo de exposição, reação) ao Peeling químico, e no atendimento
 * avulso da Sophie a profissional só viu dores, anamnese, tratamento, insumos e
 * observações. Concluiu sem a ficha ser pedida, e o prontuário ficou sem ela.
 *
 * O ramo "plano ainda não gerado" da tela do atendimento — todo atendimento
 * fora de plano, para a rede que monta plano — nunca mostrou a ficha do
 * procedimento (latente desde 2026-09-25). E nos ramos que a mostravam, o
 * "Finalizar" não a levava: só o "Salvar" a gravava.
 *
 * Agora a ficha aparece em todo ramo, e o "Finalizar" leva o que está NA TELA
 * para o prontuário na MESMA transação da conclusão (`concluir_atendimento`).
 */

const marca = Date.now().toString(36)
const db = () => banco()

const FICHA = `Ficha de peeling ${marca}`
const ACIDO = `Ácido mandélico 30% ${marca}`
const REACAO = `Eritema leve, sem ardência ${marca}`

interface Cenario {
  rede: OutraRede
  profissional: MembroDeTeste
  slug: string
  fichaId: string
  procedimento: string
}

async function montar(rotulo: string, opcoes: { semPlanos?: boolean; planoBase?: string } = {}): Promise<Cenario> {
  const rede = await criarOutraRede(`${rotulo}${marca}`)
  if (opcoes.semPlanos) {
    // A rede cujo plano não tem "planos de tratamento" (o outro ramo da tela).
    const recursos = {
      funcionalidades: FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'planos_de_tratamento'),
      limites: { unidades: null, membros: null, whatsapp: null },
    }
    expect((await db().from('tenant_subscriptions').upsert(
      { tenant_id: rede.tenantId, plan_id: opcoes.planoBase, valor_centavos: 0, recursos }, { onConflict: 'tenant_id' })).error).toBeNull()
  }
  const slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: ficha, error: eFicha } = await db().from('forms').insert({
    tenant_id: rede.tenantId, name: FICHA, is_active: true, tipo: 'PROCEDIMENTO',
    schema: { rows: [
      { id: 'r1', fields: [
        { id: 'fototipo', type: 'select', label: 'Fototipo', required: true, options: ['I', 'II', 'III', 'IV', 'V', 'VI'] },
        { id: 'acido', type: 'text', label: 'Ácido utilizado' },
      ] },
      { id: 'r2', fields: [{ id: 'tempo', type: 'number', label: 'Tempo de exposição (min)' }] },
      { id: 'r3', fields: [{ id: 'reacao', type: 'textarea', label: 'Reação da pele' }] },
    ] },
  }).select('id').single<{ id: string }>()
  expect(eFicha).toBeNull()
  // O procedimento é o padrão da rede: avulso, sem plano, com a ficha própria.
  expect((await db().from('procedures').update({ name: `[e2e] Peeling químico ${marca}`, form_id: ficha!.id, price: 0 })
    .eq('id', rede.procedureId)).error).toBeNull()
  const profissional = await criarMembro(`${rotulo}p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  return { rede, profissional, slug, fichaId: ficha!.id, procedimento: rede.procedureId }
}

async function desmontar(c: Cenario | null) {
  if (!c) return
  // Os agendamentos (com prontuário e comissão) antes do membro: apontam para ele.
  const { data: ags } = await db().from('appointments').select('id').eq('branch_id', c.rede.branchId)
  const falhas = await apagarAgendamentos((ags ?? []).map(a => a.id as string))
  expect(falhas, 'a limpeza tem de apagar tudo').toEqual([])
  await db().from('procedures').update({ form_id: null }).eq('id', c.procedimento)
  await db().from('forms').delete().eq('id', c.fichaId)
  await db().from('tenant_subscriptions').delete().eq('tenant_id', c.rede.tenantId)
  await c.profissional.limpar()
  await c.rede.limpar()
}

async function atendimentoAvulsoEmCurso(c: Cenario, rotulo: string): Promise<string> {
  const cliente = await c.rede.criarCliente(rotulo)
  // A ficha de saúde respondida (as obrigatórias): desde a revisão do Heitor de
  // 2026-10-29, a obrigatória sem resposta barra o "Finalizar atendimento".
  await responderAnamnese(cliente, c.rede.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: c.rede.branchId, client_id: cliente, procedure_id: c.procedimento, professional_id: c.profissional.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

async function como(browser: Browser, c: Cenario, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: c.profissional.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Preenche a ficha do procedimento pela tela — sem o "Salvar" dela. */
async function preencherFicha(p: Page) {
  await expect(p.getByText(FICHA).first(), 'a ficha do procedimento aparece no atendimento').toBeVisible()
  await p.locator('[data-campo="fototipo"] select').selectOption('III')
  await p.locator('[data-campo="acido"] input').fill(ACIDO)
  await p.locator('[data-campo="tempo"] input').fill('4')
  await p.locator('[data-campo="reacao"] textarea').fill(REACAO)
}

async function finalizar(p: Page, id: string) {
  await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
  await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
  await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single()).data?.status).toBe('COMPLETED')
}

async function fichaGravada(id: string) {
  const { data, error } = await db().from('medical_record_entries').select('form_data').eq('appointment_id', id).single()
  expect(error).toBeNull()
  return (data?.form_data as { ficha?: { formId: string; name: string; answers: Record<string, unknown> } } | null)?.ficha ?? null
}

test.describe('a rede que monta plano: o atendimento avulso (ramo da avaliação)', () => {
  let c: Cenario | null = null
  test.beforeAll(async () => { test.setTimeout(180_000); c = await montar('fpa') })
  test.afterAll(async () => { await desmontar(c) })

  test('a ficha própria do procedimento aparece, é preenchida e vai ao prontuário ao finalizar', async ({ browser }) => {
    const id = await atendimentoAvulsoEmCurso(c!, 'Sophie')
    await como(browser, c!, async p => {
      await p.goto(`/${c!.slug}/agenda/${id}`)
      // O ramo da avaliação (as dores à mostra): era aqui que a ficha faltava.
      await expect(p.getByRole('heading', { name: 'Dores do cliente' })).toBeVisible()
      await preencherFicha(p)
      await finalizar(p, id)
    })
    const ficha = await fichaGravada(id)
    expect(ficha, 'o prontuário guarda a ficha do procedimento').not.toBeNull()
    expect(ficha!.formId).toBe(c!.fichaId)
    expect(ficha!.name).toBe(FICHA)
    expect(ficha!.answers).toMatchObject({ fototipo: 'III', acido: ACIDO, tempo: '4', reacao: REACAO })
  })

  test('concluído, o registro bloqueado não abre a anamnese em branco nem oferece gerar o plano (A30)', async ({ browser }) => {
    const id = await atendimentoAvulsoEmCurso(c!, 'Concluida')
    expect((await db().from('appointments').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', id)).error).toBeNull()
    await como(browser, c!, async p => {
      await p.goto(`/${c!.slug}/agenda/${id}`)
      await expect(p.getByText('Registro bloqueado para edição')).toBeVisible()
      await expect(p.getByText(FICHA).first(), 'a ficha do procedimento continua à vista').toBeVisible()
      await expect(p.locator('[data-anamnese-geral] textarea, [data-anamnese-geral] input'), 'a anamnese se lê, não se preenche').toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Enviar para a recepção' })).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Fechar agora' })).toHaveCount(0)
    })
  })
})

test.describe('a rede sem planos de tratamento: o outro ramo da tela', () => {
  let c: Cenario | null = null
  let planoBase: string | null = null
  test.beforeAll(async () => {
    test.setTimeout(180_000)
    const { data, error } = await db().from('platform_plans').insert({ nome: `[e2e] Plano sem planos ${marca}`, valor_centavos: 0 })
      .select('id').single<{ id: string }>()
    expect(error).toBeNull()
    planoBase = data!.id
    c = await montar('fpb', { semPlanos: true, planoBase })
  })
  test.afterAll(async () => {
    await desmontar(c)
    if (planoBase) await db().from('platform_plans').delete().eq('id', planoBase)
  })

  test('o "Finalizar" leva a ficha da tela ao prontuário, sem precisar do "Salvar"', async ({ browser }) => {
    const id = await atendimentoAvulsoEmCurso(c!, 'Sophie')
    await como(browser, c!, async p => {
      await p.goto(`/${c!.slug}/agenda/${id}`)
      await expect(p.getByRole('heading', { name: 'Dores do cliente' }), 'sem planos, não é o ramo da avaliação').toHaveCount(0)
      await preencherFicha(p)
      await finalizar(p, id)
    })
    const ficha = await fichaGravada(id)
    expect(ficha, 'o prontuário guarda a ficha do procedimento').not.toBeNull()
    expect(ficha!.answers).toMatchObject({ fototipo: 'III', acido: ACIDO, tempo: '4', reacao: REACAO })
  })
})
