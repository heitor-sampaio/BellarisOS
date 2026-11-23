import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os mapas de injetáveis sem o "só os meus" (SM1, o Heitor, 2026-11-23): quem
 * tem o Prontuário vê, na lista de Injetáveis e pelo id, os mapas de TODAS as
 * clientes da unidade ao alcance — também os de cliente de outra profissional
 * e os avulsos que outra pessoa mexeu —; com o Atendimento em Gerenciar,
 * renomeia (o Heitor, 2026-11-23: injetáveis = quem realiza atendimento).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let ela: MembroDeTeste | null = null
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
      { modulo: 'medical_records', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'VIEW' },
      { modulo: 'atendimento', nivel: 'MANAGE' },
    ],
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
  await mapa('dela', clienteDela, ela.userId)
  await mapa('deOutra', clienteOutra, rede.professionalId)
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
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('a lista de Injetáveis, com o Prontuário, mostra os mapas de todas — não só os dela', async ({ browser }) => {
  await como(ela!, browser, async p => {
    await p.goto(`/${slug}/injetaveis`)
    for (const m of Object.values(mapas)) await expect(p.getByText(m.nome), m.nome).toBeVisible()
  })
})

test('pelo id: abre e renomeia o mapa de cliente de outra profissional', async ({ browser }) => {
  const tela = `/${slug}/injetaveis/${mapas.dela.id}`
  const novoNome = `${mapas.deOutra.nome} renomeado`
  await como(ela!, browser, async p => {
    await p.goto(tela)
    const aberto = await chamarAcao(p, 'actions/injectable-map.ts', 'getPlanejamentoInjetavel', tela, [mapas.deOutra.id])
    expect(aberto.texto).not.toContain('Server action not found')
    expect(aberto.texto, 'o de cliente de outra abre').toContain(mapas.deOutra.nome)
    const avulso = await chamarAcao(p, 'actions/injectable-map.ts', 'getPlanejamentoInjetavel', tela, [mapas.avulsoDeOutra.id])
    expect(avulso.texto, 'o avulso de outra pessoa abre').toContain(mapas.avulsoDeOutra.nome)
    await chamarAcao(p, 'actions/injectable-map.ts', 'renomearPlanejamentoInjetavel', tela, [mapas.deOutra.id, novoNome])
  })
  const { data } = await db().from('injectable_maps').select('name').eq('id', mapas.deOutra.id).single<{ name: string }>()
  expect(data!.name, 'o Atendimento em Gerenciar renomeia').toBe(novoNome)
})
