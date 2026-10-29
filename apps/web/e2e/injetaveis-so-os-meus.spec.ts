import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os mapas de injetáveis com o prontuário "só os meus" (decisão do Heitor,
 * 2026-10-28: "quem tem 'só os meus' vê 'só os meus', em qualquer lugar").
 *
 * A frente G achou: `listarMapasDeInjetaveis` conferia `medical_records: VIEW`
 * e ignorava o escopo — a profissional via na lista de Injetáveis os mapas
 * (dado clínico) de clientes de outras profissionais, e abria qualquer um
 * pelo id.
 *
 * "Dela" é a regra do resto do prontuário OWN (a ficha, `recusaDoAnexo`): a
 * cliente que ela atende (um agendamento com ela). O mapa avulso (sem
 * cliente) é dela quando foi ela quem o mexeu por último (`updated_by`).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let ela: MembroDeTeste | null = null
let todos: MembroDeTeste | null = null
let slug = ''
const mapas: Record<'dela' | 'deOutra' | 'avulsoDela' | 'avulsoDeOutra', { id: string; nome: string }> = {} as never

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ij${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  ela = await criarMembro(`ijp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' },
    ],
  })
  todos = await criarMembro(`ija${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Prontuário de todos',
    permissoes: [{ modulo: 'medical_records', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  const clienteDela  = await rede.criarCliente('Cliente dela')
  const clienteOutra = await rede.criarCliente('Cliente de outra')
  const amanha = new Date(Date.now() + 86_400_000); amanha.setUTCHours(13, 0, 0, 0)
  for (const [cliente, prof] of [[clienteDela, ela.userId], [clienteOutra, rede.professionalId]] as const) {
    const { error } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: prof,
      scheduled_at: amanha.toISOString(), duration_min: 60, price: 100, status: 'SCHEDULED', source: 'INTERNAL',
    })
    expect(error, 'agendamento').toBeNull()
  }
  const mapa = async (chave: keyof typeof mapas, cliente: string | null, autor: string) => {
    const nome = `${PREFIXO} Mapa ${chave} ${marca}`
    const { data, error } = await db().from('injectable_maps').insert({
      tenant_id: rede!.tenantId, client_id: cliente, branch_id: rede!.branchId, name: nome,
      view: 'front', points: [], updated_by: autor,
    }).select('id').single<{ id: string }>()
    expect(error, `mapa ${chave}`).toBeNull()
    mapas[chave] = { id: data!.id, nome }
  }
  await mapa('dela', clienteDela, todos.userId)
  await mapa('deOutra', clienteOutra, ela.userId)
  await mapa('avulsoDela', null, ela.userId)
  await mapa('avulsoDeOutra', null, rede.professionalId)
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const r = await db().from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
    if (r.error) falhas.push(`mapas: ${r.error.message}`)
  }
  await ela?.limpar()
  await todos?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('a lista de Injetáveis, com o prontuário "só os meus", mostra só os mapas dela', async ({ browser }) => {
  await como(ela!, browser, async p => {
    await p.goto(`/${slug}/injetaveis`)
    await expect(p.getByText(mapas.dela.nome)).toBeVisible()
    await expect(p.getByText(mapas.avulsoDela.nome)).toBeVisible()
    await expect(p.getByText(mapas.deOutra.nome), 'mapa de cliente de outra profissional').toHaveCount(0)
    await expect(p.getByText(mapas.avulsoDeOutra.nome), 'avulso de outra pessoa').toHaveCount(0)
  })
  // Controle: com o prontuário de todos, os quatro.
  await como(todos!, browser, async p => {
    await p.goto(`/${slug}/injetaveis`)
    for (const m of Object.values(mapas)) await expect(p.getByText(m.nome)).toBeVisible()
  })
})

test('pelo id: não abre nem renomeia o mapa de cliente de outra', async ({ browser }) => {
  const tela = `/${slug}/injetaveis/${mapas.dela.id}`
  await como(ela!, browser, async p => {
    await p.goto(tela)
    const aberto = await chamarAcao(p, 'actions/injectable-map.ts', 'getPlanejamentoInjetavel', tela, [mapas.deOutra.id])
    expect(aberto.texto).not.toContain('Server action not found')
    expect(aberto.texto).toContain('Planejamento não encontrado')
    const avulso = await chamarAcao(p, 'actions/injectable-map.ts', 'getPlanejamentoInjetavel', tela, [mapas.avulsoDeOutra.id])
    expect(avulso.texto).toContain('Planejamento não encontrado')
    await chamarAcao(p, 'actions/injectable-map.ts', 'renomearPlanejamentoInjetavel', tela, [mapas.deOutra.id, 'invasão'])
    const meu = await chamarAcao(p, 'actions/injectable-map.ts', 'getPlanejamentoInjetavel', tela, [mapas.dela.id])
    expect(meu.texto, 'o dela abre').toContain(mapas.dela.nome)
  })
  const { data } = await db().from('injectable_maps').select('name').eq('id', mapas.deOutra.id).single<{ name: string }>()
  expect(data!.name).toBe(mapas.deOutra.nome)
  // Controle: com o prontuário de todos, abre o de outra.
  await como(todos!, browser, async p => {
    await p.goto(tela)
    const aberto = await chamarAcao(p, 'actions/injectable-map.ts', 'getPlanejamentoInjetavel', tela, [mapas.deOutra.id])
    expect(aberto.texto).toContain(mapas.deOutra.nome)
  })
})
