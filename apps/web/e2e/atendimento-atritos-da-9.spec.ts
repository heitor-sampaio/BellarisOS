import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { responderAnamnese } from './apoio/anamnese'
import { saudacao } from '../lib/saudacao'

/**
 * Os atritos do atendimento da 9ª simulação (2026-11-07), da F42:
 * - A11: a sessão não dizia de qual lote/validade sai o insumo (o FEFO estava
 *   certo, mas só o Estoque dizia de qual frasco saiu).
 * - A25: a intercorrência digitada na desistência ia ao prontuário, mas não
 *   aparecia na tela do atendimento cancelado.
 * - A26: a foto clínica vai para Documentos → Foto clínica, e o texto dizia
 *   "ela fica no prontuário".
 * - D18: a saudação da topbar ("Boa noite" → "Olá") dava erro de hidratação na
 *   virada das faixas: o servidor e o navegador a calculavam cada um.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let profissional: MembroDeTeste | null = null
let toxina = ''
const loteA = `TOX-A1-${marca}`
const loteB = `TOX-B2-${marca}`
const diaISO = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000)
const naTela = (dia: string) => dia.split('-').reverse().join('/')

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function atendimento(rotulo: string, extra: Record<string, unknown> = {}) {
  const cliente = await rede!.criarCliente(rotulo)
  await responderAnamnese(cliente, rede!.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    ...extra,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`at9${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`at9p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  // A toxina em U, com dois lotes: o A1 (1 frasco, vence antes) e o B2 (2 frascos).
  const { data: p, error } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Toxina ${marca}`, unit: 'frasco', consumption_unit: 'U', units_per_package: 100, uso: 'INSUMO' })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  toxina = p!.id
  for (const [lote, qtd, dias] of [[loteA, 1, 19], [loteB, 2, 120]] as const) {
    expect((await db().rpc('estoque_entrada', {
      p_produto: toxina, p_unidade: rede.branchId, p_quantidade: qtd, p_custo: 980, p_observacao: null,
      p_lote: lote, p_validade: diaISO(emDias(dias)), p_autor: 'e2e',
    })).error).toBeNull()
  }
  // O procedimento leva 120 U: 100 do A1 e 20 do B2, pelo FEFO.
  expect((await db().from('procedure_products').insert({ procedure_id: rede.procedureId, product_id: toxina, quantity: 120, unit_cost: 0 })).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    await db().from('procedure_products').delete().eq('procedure_id', rede.procedureId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('A11: o insumo da sessão diz de qual lote sai, pelo vencimento mais próximo', async ({ browser }) => {
  const { id } = await atendimento('Lote')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const linha = p.locator(`[data-insumo="${toxina}"]`).first()
    await expect(linha.locator('[data-lote-do-insumo]')).toHaveText(
      `Sai do lote ${loteA} (vence ${naTela(diaISO(emDias(19)))}): 100 U; e do lote ${loteB} (vence ${naTela(diaISO(emDias(120)))}): 20 U`)
  })
})

test('A25: o atendimento cancelado mostra a intercorrência registrada na desistência', async ({ browser }) => {
  const { id, cliente } = await atendimento('Desistiu', { status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancellation_reason: 'A cliente passou mal' })
  const { data: prontuario } = await db().from('medical_records').select('id').eq('client_id', cliente).single<{ id: string }>()
  expect((await db().from('medical_record_entries').insert({
    medical_record_id: prontuario!.id, appointment_id: id, professional_id: profissional!.userId, intercurrences: 'Reação vasovagal leve',
  })).error).toBeNull()
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.getByText('Atendimento cancelado').first()).toBeVisible()
    await expect(p.locator('[data-intercorrencia-do-cancelado]')).toContainText('Intercorrência: Reação vasovagal leve')
  })
})

test('A26: sem foto, o cartão diz onde a foto clínica fica (Documentos → Foto clínica)', async ({ browser }) => {
  const { id } = await atendimento('Foto')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const vazio = p.getByText(/Nenhuma foto neste atendimento/)
    await expect(vazio).toContainText('Documentos → Foto clínica')
    await expect(vazio).not.toContainText('fica no prontuário')
  })
})

test('D18: a saudação da topbar não dá erro de hidratação quando o navegador está em outra faixa de horário', async ({ browser }) => {
  const { id } = await atendimento('Saudação')
  await como(browser, profissional!, async p => {
    // O navegador 12 h à frente do servidor: as faixas (Olá, Bom dia, Boa tarde,
    // Boa noite) têm até 7 h, então a saudação dele é sempre outra.
    const noNavegador = new Date(Date.now() + 12 * 3_600_000)
    await p.clock.setFixedTime(noNavegador)
    const erros: string[] = []
    p.on('console', m => { if (m.type() === 'error' && /hydrat|#418/i.test(m.text())) erros.push(m.text().slice(0, 300)) })
    p.on('pageerror', e => { if (/hydrat|#418/i.test(e.message)) erros.push(e.message.slice(0, 300)) })
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.locator('.topbar-saudacao')).toContainText(`${saudacao(noNavegador)},`)
    expect(erros, 'sem erro de hidratação').toEqual([])
  })
})
