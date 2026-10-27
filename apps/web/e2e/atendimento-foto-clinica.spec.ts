import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A30 da simulação de 2026-10-27: não havia anexo de foto na tela do
 * atendimento. A Lívia anexou a foto por Clientes → Documentos → "Foto
 * clínica", fora do fluxo e sem ligação com o atendimento.
 *
 * Agora a tela do atendimento tem "Fotos do atendimento": o MESMO upload dos
 * Documentos (bucket privado, categoria "Foto clínica", a mesma recusa do
 * anexo clínico), ligado ao agendamento (`client_documents.appointment_id`).
 * Só para quem vê o prontuário deste atendimento.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let outraCliente = ''
let atendimento = ''
let atendimentoDaOutra = ''
// PNG de 1×1.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const fotosDo = async (appointmentId: string) => (await db().from('client_documents')
  .select('id, category, client_id').eq('appointment_id', appointmentId)).data ?? []

test.beforeAll(async () => {
  rede = await criarOutraRede(`fc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`fcp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  recepcao = await criarMembro(`fcr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Mariana')
  outraCliente = await rede.criarCliente('Outra')
  const base = { branch_id: rede.branchId, procedure_id: rede.procedureId, professional_id: profissional.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString() }
  const { data, error } = await db().from('appointments').insert([
    { ...base, client_id: cliente },
    { ...base, client_id: outraCliente, scheduled_at: new Date(Date.now() - 90 * 60_000).toISOString() },
  ]).select('id, client_id')
  expect(error).toBeNull()
  atendimento = data!.find(a => a.client_id === cliente)!.id
  atendimentoDaOutra = data!.find(a => a.client_id === outraCliente)!.id
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test.describe.serial('a foto clínica pela tela do atendimento', () => {
  test('a profissional anexa a foto ali, e ela fica ligada ao atendimento', async ({ browser }) => {
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      const fotos = p.locator('[data-fotos-do-atendimento]')
      await fotos.getByRole('button', { name: 'Anexar foto' }).click()
      await fotos.locator('input[name="file"]').setInputFiles({ name: 'antes.png', mimeType: 'image/png', buffer: PNG })
      await fotos.getByRole('button', { name: 'Anexar foto' }).last().click()
      await expect.poll(async () => (await fotosDo(atendimento)).length).toBe(1)
      await expect(fotos.getByRole('img', { name: /Foto clínica/ }), 'a foto aparece na tela do atendimento').toBeVisible()
    })
    const anexadas = await fotosDo(atendimento)
    expect(anexadas).toHaveLength(1)
    expect(anexadas[0]).toMatchObject({ category: 'foto_clinica', client_id: cliente })
  })

  test('a ligação com o atendimento é conferida: o de outra cliente é recusado', async ({ browser }) => {
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      const fotos = p.locator('[data-fotos-do-atendimento]')
      await fotos.getByRole('button', { name: 'Anexar foto' }).click()
      await fotos.locator('input[name="file"]').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: PNG })
      await fotos.locator('input[name="appointment_id"]').evaluate((el, outro) => { (el as HTMLInputElement).value = outro }, atendimentoDaOutra)
      await fotos.getByRole('button', { name: 'Anexar foto' }).last().click()
      await expect(fotos.getByText(/não é desta cliente|não encontrado/i)).toBeVisible()
    })
    expect(await fotosDo(atendimentoDaOutra)).toHaveLength(0)
  })

  test('sem o prontuário, a tela do atendimento não mostra nem anexa foto', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/agenda/${atendimento}`)
      await expect(p.getByRole('heading', { name: /Agendamento|Atendimento/ }).first().or(p.locator('main'))).toBeVisible()
      await expect(p.locator('[data-fotos-do-atendimento]')).toHaveCount(0)
    })
  })
})
