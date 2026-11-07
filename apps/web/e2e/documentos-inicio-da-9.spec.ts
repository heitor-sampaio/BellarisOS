import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { haMinutosHoje } from './apoio/datas'

/**
 * O termo do início na 9ª simulação (2026-11-07), da F42:
 * - D7 (regressão da F33): o termo do INÍCIO nasce no check-in (ARRIVED) e, no
 *   início direto de Confirmado, "a trava do início emite antes de conferir" —
 *   mas a trava recusa no MESMO update, e a transação desfazia a emissão. Quem
 *   iniciava sem o "Chegou" lia "Falta assinar: Termo… Colha a assinatura", e o
 *   termo não existia para assinar (a ficha dizia "Nenhum termo…").
 * - A23: o termo que bloqueia não tinha caminho na janela do agendamento; a
 *   assinatura estava em Clientes → Documentos → Colher assinatura.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let slug = ''
let agendamento = ''
let modelo = ''
const TITULO = `${PREFIXO} Termo do início ${marca}`

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const documentos = async () =>
  ((await db().from('issued_documents').select('id, template_id, status').eq('appointment_id', agendamento)).data ?? []) as
    { id: string; template_id: string; status: string }[]

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`di9${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  const { data: m, error: eM } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: TITULO, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'INICIO_ATENDIMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, autorizo.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(eM).toBeNull()
  modelo = (m as { id: string }).id
  expect((await db().from('procedures').update({ consent_template_id: modelo }).eq('id', rede.procedureId)).error).toBeNull()
  const cliente = await rede.criarCliente('Inicio')
  // Confirmado, sem o "Chegou", no horário (sem a pergunta do início adiantado).
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'CONFIRMED', source: 'INTERNAL', duration_min: 60, price: 0, scheduled_at: haMinutosHoje(10),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamento = ap!.id
  recepcao = await criarMembro(`di9r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }],
  })
  soVe = await criarMembro(`di9v${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Só vê termos',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'documents', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (agendamento) expect(await apagarDocumentosEmitidos((await documentos()).map(d => d.id))).toEqual([])
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await recepcao?.limpar(); await soVe?.limpar(); await rede?.limpar()
})

test.describe.serial('o termo do início', () => {
  test('D7: iniciar sem o "Chegou" recusa, e o termo que ele pede passa a existir para assinar', async ({ browser }) => {
    expect(await documentos(), 'confirmado, o termo do início ainda não nasceu').toEqual([])
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slug}/agenda/${agendamento}`)
      await p.getByRole('button', { name: 'Iniciar atendimento' }).click()
      await expect(p.getByText(`Falta assinar: ${TITULO}`).first()).toBeVisible()
      // O termo está lá para colher: o painel dos documentos o lista.
      const painel = p.getByRole('region', { name: 'Documentos do atendimento' })
      await expect(painel.getByText(TITULO)).toBeVisible()
    })
    await expect.poll(async () => (await documentos()).map(d => d.template_id)).toEqual([modelo])
    expect((await db().from('appointments').select('status').eq('id', agendamento).single()).data?.status).toBe('CONFIRMED')
  })

  test('A23: na janela do agendamento, o termo que bloqueia leva a colher a assinatura (a quem tem os Termos)', async ({ browser }) => {
    const [doc] = await documentos()
    expect(doc, 'o termo do D7').toBeTruthy()
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slug}/agenda`)
      await p.locator(`[data-agendamento="${agendamento}"]`).first().click()
      const janela = p.getByRole('dialog', { name: 'Agendamento' })
      const item = janela.locator('[data-documentos-do-agendamento] li', { hasText: TITULO })
      await expect(item).toContainText('bloqueia o início')
      await expect(item.getByRole('link', { name: 'Colher assinatura' })).toHaveAttribute('href', new RegExp(`^/${slug}/documentos/${doc!.id}/assinar\\?voltar=`))
    })
    await como(browser, soVe!, async p => {
      await p.goto(`/${slug}/agenda`)
      await p.locator(`[data-agendamento="${agendamento}"]`).first().click()
      const janela = p.getByRole('dialog', { name: 'Agendamento' })
      const item = janela.locator('[data-documentos-do-agendamento] li', { hasText: TITULO })
      await expect(item).toContainText('bloqueia o início')
      await expect(item.getByRole('link', { name: 'Colher assinatura' })).toHaveCount(0)
    })
  })
})
