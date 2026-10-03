import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Dado clínico só com o módulo de prontuário, e credencial nunca na tela
 * (2026-10-03, fase 0 do suporte).
 *
 * Vazavam para quem NÃO tinha prontuário: a evolução do atendimento (com só
 * agenda), o exame e o laudo do cliente (com só clientes), a anotação do
 * profissional e a anamnese no arquivo do tratamento (com só agenda). E a aba
 * de integrações mandava ao navegador o token das caixas de WhatsApp.
 *
 * As marcas são ASCII de propósito: o teste procura o texto no payload da
 * página, e a ausência só prova algo porque o CONTROLE (o admin) acha o mesmo
 * texto pelo mesmo caminho.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const EVOLUCAO = `EVOLUCAO-SECRETA-${marca}`
const LAUDO    = `LAUDO-SECRETO-${marca}`
const NOTA     = `NOTA-DO-PLANO-${marca}`
const ANAMNESE = `ANAMNESE-SECRETA-${marca}`
const TOKEN    = `TOKEN-SECRETO-${marca}`
const MARCADOR = '••••••••'

interface Fx {
  outra: OutraRede; admin: MembroDeTeste; recepcao: MembroDeTeste
  clienteId: string; agendamentoId: string; planoId: string; laudoId: string; numeroId: string
}
let f: Fx | null = null
const criado: { outra?: OutraRede; membros: MembroDeTeste[]; numeroId?: string } = { membros: [] }

test.beforeAll(async () => {
  test.setTimeout(180_000)
  const b = db()
  const outra = await criarOutraRede(`cl${marca}`)
  criado.outra = outra

  const membro = async (chave: string, permissoes: Parameters<typeof criarMembro>[1]['permissoes']) => {
    const m = await criarMembro(`cl${chave}${marca}`, { tenant: outra.tenantId, rotulo: `Clinico ${chave}`, permissoes })
    criado.membros.push(m); return m
  }
  const admin = await membro('admin', [
    { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
    { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' },
  ])
  // A recepção: cadastro e agenda, SEM prontuário.
  const recepcao = await membro('recepcao', [
    { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
  ])

  const clienteId = await outra.criarCliente('Paciente Clinico')
  const amanha = new Date(Date.now() + 24 * 3600_000).toISOString()
  const { data: ap, error: eAp } = await b.from('appointments').insert({
    branch_id: outra.branchId, client_id: clienteId, procedure_id: outra.procedureId,
    professional_id: outra.professionalId, status: 'SCHEDULED', source: 'INTERNAL',
    scheduled_at: amanha, duration_min: 30, price: 0,
  }).select('id').single<{ id: string }>()
  expect(eAp, 'criar o agendamento').toBeNull()

  const { data: pr, error: ePr } = await b.from('medical_records')
    .upsert({ client_id: clienteId, general_anamnesis: { queixa: ANAMNESE } }, { onConflict: 'client_id' })
    .select('id').single<{ id: string }>()
  expect(ePr, 'criar o prontuário').toBeNull()
  const { error: eEn } = await b.from('medical_record_entries').insert({
    medical_record_id: pr!.id, appointment_id: ap!.id, professional_id: outra.professionalId,
    notes: EVOLUCAO, intercurrences: null,
  })
  expect(eEn, 'criar a evolução').toBeNull()

  const { data: plano, error: ePl } = await b.from('treatment_plans').insert({
    client_id: clienteId, branch_id: outra.branchId, professional_id: outra.professionalId,
    status: 'PROPOSED', professional_notes: NOTA, name: `Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(ePl, 'criar o plano').toBeNull()

  const { data: doc, error: eDoc } = await b.from('client_documents').insert({
    client_id: clienteId, branch_id: outra.branchId, name: LAUDO, category: 'laudo',
    file_path: `${outra.branchId}/${clienteId}/inexistente.pdf`, file_name: 'laudo.pdf',
  }).select('id').single<{ id: string }>()
  expect(eDoc, 'criar o laudo').toBeNull()

  const { data: num, error: eNum } = await b.from('whatsapp_numbers').insert({
    tenant_id: outra.tenantId, provider: 'uazapi', label: `Caixa ${marca}`, is_active: false,
    config: { token: TOKEN, baseUrl: 'https://e2e.invalido' },
  }).select('id').single<{ id: string }>()
  expect(eNum, 'criar a caixa').toBeNull()
  criado.numeroId = num!.id

  f = { outra, admin, recepcao, clienteId, agendamentoId: ap!.id, planoId: plano!.id, laudoId: doc!.id, numeroId: num!.id }
})

test.afterAll(async () => {
  const b = db()
  const falhas: string[] = []
  if (criado.numeroId) {
    const r = await b.from('whatsapp_numbers').delete().eq('id', criado.numeroId)
    if (r.error) falhas.push(`caixa: ${r.error.message}`)
  }
  for (const m of criado.membros) await m.limpar()
  if (criado.outra) await criado.outra.limpar()
  expect(falhas).toEqual([])
})

async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O HTML da página, com o payload do servidor junto (é ali que o dado viajaria). */
async function conteudo(p: Page, url: string): Promise<string> {
  await p.goto(url)
  await p.waitForLoadState('networkidle')
  return p.content()
}

test.describe.serial('dado clínico só com prontuário', () => {
  test('evolução do atendimento: o admin vê, a recepção não', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      expect(await conteudo(p, `/admin/agenda/${f!.agendamentoId}`)).toContain(EVOLUCAO)
    })
    await comSessao(browser, f!.recepcao.estado, async p => {
      const html = await conteudo(p, `/admin/agenda/${f!.agendamentoId}`)
      expect(html).toContain('Paciente Clinico')   // a tela abriu
      expect(html).not.toContain(EVOLUCAO)
    })
  })

  test('laudo na ficha do cliente: o admin vê, a recepção não — nem apaga pela action', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      expect(await conteudo(p, `/admin/clients/${f!.clienteId}?aba=documentos`)).toContain(LAUDO)
    })
    await comSessao(browser, f!.recepcao.estado, async p => {
      const html = await conteudo(p, `/admin/clients/${f!.clienteId}?aba=documentos`)
      expect(html).toContain('Paciente Clinico')
      expect(html).not.toContain(LAUDO)
      await chamarAcao(p, 'actions/client-documents.ts', 'deleteClientDocument', `/admin/clients/${f!.clienteId}`,
        [f!.laudoId, 'x', f!.clienteId])
    })
    const { data } = await db().from('client_documents').select('id').eq('id', f!.laudoId).maybeSingle()
    expect(data, 'a recepção não apaga anexo clínico').not.toBeNull()
  })

  test('arquivo do tratamento: anotação do profissional e anamnese só com prontuário', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'getTreatmentPlanDetails', `/admin/clients/${f!.clienteId}`,
        [f!.planoId, f!.clienteId])
      expect(r.texto).toContain(NOTA)
      expect(r.texto).toContain(ANAMNESE)
    })
    await comSessao(browser, f!.recepcao.estado, async p => {
      const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'getTreatmentPlanDetails', `/admin/clients/${f!.clienteId}`,
        [f!.planoId, f!.clienteId])
      expect(r.texto).not.toContain(NOTA)
      expect(r.texto).not.toContain(ANAMNESE)
    })
  })
})

test.describe.serial('credencial de integração fora da tela', () => {
  test('a aba de integrações mostra o marcador, nunca o token', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      const html = await conteudo(p, '/admin/settings?tab=integrations')
      expect(html).toContain(`Caixa ${marca}`)
      expect(html).not.toContain(TOKEN)
      expect(html).toContain(MARCADOR)
    })
  })

  test('salvar com o marcador mantém o token do banco', async ({ browser }) => {
    await comSessao(browser, f!.admin.estado, async p => {
      await chamarAcao(p, 'actions/integrations.ts', 'salvarNumeroWhatsApp', '/admin/settings',
        [f!.numeroId, 'uazapi', { token: MARCADOR, baseUrl: 'https://e2e.invalido' }, false])
    })
    const { data } = await db().from('whatsapp_numbers').select('config').eq('id', f!.numeroId).single<{ config: Record<string, string> }>()
    expect(data!.config.token).toBe(TOKEN)
  })
})
