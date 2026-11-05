import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede } from './apoio/outra-rede'
import { criarMembro } from './apoio/sessao'
import { apagarRedeCriada } from './apoio/rede-criada'
import { apagarRedeDeTeste, apagarRedesAdiadas, lerRegistro } from './apoio/limpeza-adiada'

/**
 * A rede de teste sai INTEIRA numa passada só no servidor (F25, 2026-11-05).
 *
 * As completas de 2026-11-04/05 travaram o Supabase da produção com a própria
 * limpeza: cada `afterAll` apagava a rede dele em ~45 DELETEs pelo PostgREST
 * (~17 mil na rodada), enquanto os outros testes rodavam — consultas de 6 a
 * 35 s, `auth.admin.createUser` em 504, e as actions "sem resposta". Agora:
 *
 * - `e2e_apagar_rede` apaga a rede de teste inteira numa chamada, e RECUSA a
 *   que não é de teste (as [sim] da simulação, as reais);
 * - na completa (`E2E_LIMPEZA_ADIADA=1`), o `limpar()` só anota a rede, e
 *   ela sai no fim da rodada (`apagarRedesAdiadas`).
 */

const marca = Date.now().toString(36)
const db = () => banco()

test('a trava reconhece a rede de teste — e nunca a [sim] nem a real', async () => {
  const eh = async (p_nome: string, p_slug: string, p_email: string | null) => {
    const { data, error } = await db().rpc('e2e_eh_rede_de_teste', { p_nome, p_slug, p_email })
    expect(error, `${p_nome}: a trava responde`).toBeNull()
    return data as boolean
  }
  expect(await eh('[e2e] Outra rede x', 'e2e-outra-x', 'e2e-outra-x@bellaris.invalid')).toBe(true)
  expect(await eh('Renomeada pela tela', 'e2e-outra-x', 'e2e-outra-x@bellaris.invalid'), 'o endereço e o e-mail de teste seguram').toBe(true)
  expect(await eh('[sim] Clínica Aurora', 'sim-clinica-aurora-5a7504', 'sim-dona@bellaris.invalid')).toBe(false)
  expect(await eh('[sim] Rede Magnólia', 'e2e-outra-x', 'e2e-outra-x@bellaris.invalid'), '[sim] nunca, nem com cara de teste').toBe(false)
  expect(await eh('Bellaris Clinic', 'bellaris', 'admin@bellarisos.com')).toBe(false)
  expect(await eh('Clínica [e2e]', 'clinica', null), '[e2e] fora do começo não vale').toBe(false)
  expect(await eh('Clínica', 'e2e-clinica', 'dona@clinica.com.br'), 'o endereço sozinho não basta').toBe(false)
})

test('recusa apagar uma rede que não é de teste — e não apaga nada dela', async () => {
  const b = db()
  // Uma rede descartável SEM a marca de teste: é ela que a função tem de recusar.
  const { data: t, error } = await b.from('tenants')
    .insert({ name: `Trava da limpeza ${marca}`, slug: `e2e-trava-${marca}`, email: `trava-${marca}@bellaris.invalid` })
    .select('id').single<{ id: string }>()
  expect(error, 'criar a rede descartável').toBeNull()
  let unidade: string | null = null
  try {
    const { data: u, error: eU } = await b.from('branches')
      .insert({ tenant_id: t!.id, name: `Trava ${marca}`, slug: `e2e-trava-un-${marca}` })
      .select('id').single<{ id: string }>()
    expect(eU, 'criar a unidade da rede descartável').toBeNull()
    unidade = u!.id

    const { error: recusa } = await b.rpc('e2e_apagar_rede', { p_tenant: t!.id })
    expect(recusa?.message, 'a função recusa').toMatch(/não é uma rede de teste/)
    const { data: ficou } = await b.from('tenants').select('id').eq('id', t!.id).maybeSingle()
    expect(ficou, 'a rede continua lá').not.toBeNull()
    const { data: unidadeFicou } = await b.from('branches').select('id').eq('id', unidade).maybeSingle()
    expect(unidadeFicou, 'e a unidade dela também').not.toBeNull()
  } finally {
    if (unidade) await b.from('branches').delete().eq('id', unidade)
    expect(await apagarRedeCriada(t!.id)).toEqual([])
  }
})

test('apaga a rede de teste inteira — o que o teste criou nela e os logins', async () => {
  const b = db()
  const rede = await criarOutraRede(`lrt${marca}`)
  const cliente = await rede.criarCliente('Cliente')
  const produto = await rede.criarProduto('Produto', 3)
  const plano = await rede.criarPlanoProposto('Plano')
  const membro = await criarMembro(`lrtm${marca}`, { tenant: rede.tenantId, permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }] })
  // O que o limpar() antigo não levava (e a rede ficava): uma segunda unidade,
  // com agendamento e sala, e uma oportunidade.
  const { data: segunda, error: eS } = await b.from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Segunda ${marca}`, slug: `e2e-lrt2-${marca}` })
    .select('id').single<{ id: string }>()
  expect(eS, 'criar a segunda unidade').toBeNull()
  const { data: sala, error: eSala } = await b.from('rooms')
    .insert({ branch_id: segunda!.id, name: `${PREFIXO} Sala ${marca}` }).select('id').single<{ id: string }>()
  expect(eSala, 'criar a sala').toBeNull()
  const { error: eAg } = await b.from('appointments').insert({
    branch_id: segunda!.id, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    room_id: sala!.id, status: 'SCHEDULED', source: 'INTERNAL',
    scheduled_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(), duration_min: 30, price: 0,
  })
  expect(eAg, 'criar o agendamento').toBeNull()
  const { data: logins } = await b.from('users').select('auth_id').eq('tenant_id', rede.tenantId)
  const authIds = (logins ?? []).map(l => l.auth_id as string).filter(Boolean)
  expect(authIds.length, 'o profissional e o membro têm login').toBe(2)

  const falhas = await apagarRedeDeTeste(rede.tenantId)
  expect(falhas, 'a passada no servidor não deixa nada').toEqual([])

  const conta = async (tabela: string, coluna: string, valor: string) =>
    (await b.from(tabela).select(coluna, { count: 'exact', head: true }).eq(coluna, valor)).count
  expect(await conta('tenants', 'id', rede.tenantId), 'a rede').toBe(0)
  expect(await conta('branches', 'tenant_id', rede.tenantId), 'as unidades').toBe(0)
  expect(await conta('clients', 'tenant_id', rede.tenantId), 'os clientes').toBe(0)
  expect(await conta('users', 'tenant_id', rede.tenantId), 'os membros').toBe(0)
  expect(await conta('products', 'id', produto), 'o produto').toBe(0)
  expect(await conta('treatment_plans', 'id', plano.planId), 'o plano').toBe(0)
  expect(await conta('appointments', 'client_id', cliente), 'o agendamento').toBe(0)
  expect(await conta('loyalty_accounts', 'client_id', cliente), 'a conta de fidelidade').toBe(0)
  for (const id of authIds) {
    const { data } = await b.auth.admin.getUserById(id)
    expect(data.user, 'o login do membro e o do profissional saem junto').toBeNull()
  }
  await membro.limpar()   // já não há nada: não falha
})

test('na completa, o limpar() só anota a rede — e ela sai no fim, com apagarRedesAdiadas', async () => {
  const b = db()
  const antes = { adiada: process.env.E2E_LIMPEZA_ADIADA, dir: process.env.E2E_LIMPEZA_DIR }
  // Um registro só deste teste: o da rodada (se esta for a completa) não se mistura.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-limpeza-'))
  process.env.E2E_LIMPEZA_ADIADA = '1'
  process.env.E2E_LIMPEZA_DIR = dir
  let tenant: string | null = null
  try {
    const rede = await criarOutraRede(`lra${marca}`)
    tenant = rede.tenantId
    await rede.criarCliente('Cliente adiado')
    const membro = await criarMembro(`lram${marca}`, { tenant: rede.tenantId, permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
    await membro.limpar()
    await rede.limpar()

    expect(lerRegistro(dir), 'a rede ficou anotada').toEqual([rede.tenantId])
    const { count: membros } = await b.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', rede.tenantId)
    expect(membros, 'o membro e o profissional ficam até o fim').toBe(2)
    const { data: ficou } = await b.from('tenants').select('id').eq('id', rede.tenantId).maybeSingle()
    expect(ficou, 'a rede fica até o fim da rodada').not.toBeNull()

    const fim = await apagarRedesAdiadas({ dir, pausaMs: 0 })
    expect(fim.falhas, 'o fim da rodada apaga sem falha').toEqual([])
    expect(fim.redes).toBe(1)
    const { data: sumiu } = await b.from('tenants').select('id').eq('id', rede.tenantId).maybeSingle()
    expect(sumiu, 'no fim, a rede sai').toBeNull()
    expect(lerRegistro(dir), 'e o registro esvazia').toEqual([])
    tenant = null
  } finally {
    if (antes.adiada === undefined) delete process.env.E2E_LIMPEZA_ADIADA
    else process.env.E2E_LIMPEZA_ADIADA = antes.adiada
    if (antes.dir === undefined) delete process.env.E2E_LIMPEZA_DIR
    else process.env.E2E_LIMPEZA_DIR = antes.dir
    fs.rmSync(dir, { recursive: true, force: true })
    if (tenant) await apagarRedeDeTeste(tenant)
  }
})
