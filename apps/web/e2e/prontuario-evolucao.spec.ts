import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D4 da simulação de 2026-10-27: a aba Prontuário dizia "Nenhum atendimento
 * registrado ainda" com a evolução e a intercorrência da avaliação gravadas.
 * Só entrava na aba o atendimento com FICHA de procedimento, e a evolução
 * (`medical_record_entries.notes`) nunca era lida para a tela.
 *
 * Todo atendimento com registro clínico aparece, com ou sem ficha, e o texto
 * da evolução e da intercorrência está lá.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let cliente = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`pe${marca}`)
  dona = await criarMembro(`ped${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Mariana')
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 3 * 3600_000).toISOString(), completed_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: pr, error: e2 } = await db().from('medical_records').insert({ client_id: cliente }).select('id').single<{ id: string }>()
  expect(e2).toBeNull()
  // A avaliação não tem ficha ligada: form_data nulo, só a evolução.
  expect((await db().from('medical_record_entries').insert({
    medical_record_id: pr!.id, appointment_id: ag!.id, professional_id: rede.professionalId,
    notes: `Poros dilatados em zona T ${marca}`, intercurrences: `Eritema leve ${marca}`, form_data: null,
  })).error).toBeNull()
})
test.afterAll(async () => { await dona?.limpar(); await rede?.limpar() })

test('a aba Prontuário mostra o atendimento SEM ficha, com a evolução e a intercorrência', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${cliente}?aba=fichas`)
    await expect(p.getByText(`Poros dilatados em zona T ${marca}`)).toBeVisible()
    await expect(p.getByText(`Eritema leve ${marca}`)).toBeVisible()
    await expect(p.getByText('Nenhum atendimento registrado ainda.')).toHaveCount(0)
  } finally { await ctx.close() }
})
