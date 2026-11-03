import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos, apagarClientes } from './apoio/limpeza'
import { chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * cli-06 (revisão do Heitor, 2026-11-02: "a estrangeira também chega pelo
 * agendar rápido e pelo Copilot"): o telefone com "+" valia no cadastro
 * completo e na aba Dados, mas o "+ Agendar" com nome e telefone tirava o "+"
 * do campo (a máscara brasileira) e o servidor pedia 10 dígitos. Agora a regra
 * é a do cadastro (`telefoneDoCadastro`) em todo caminho. Numa rede [e2e].
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const agendamentos: string[] = []

test.beforeAll(async () => {
  rede = await criarOutraRede(`tp${marca}`)
  recepcao = await criarMembro(`tp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const falhas = await apagarAgendamentos(agendamentos)
  const { data } = await db().from('clients').select('id').eq('tenant_id', rede!.tenantId).like('name', `%Estrangeira%${marca}`)
  await apagarClientes((data ?? []).map(c => c.id as string), falhas)
  expect(falhas).toEqual([])
  await recepcao?.limpar()
  await rede?.limpar()
})

test('cli-06: o agendar com nome e telefone aceita o "+" no campo e grava o número como foi escrito', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  const p = await ctx.newPage()
  try {
    await p.goto('/admin/agenda')
    await p.getByRole('button', { name: 'Agendar' }).click()
    await p.getByRole('button', { name: /Não é cliente ainda/ }).click()
    const campo = p.locator('input[name="client_phone"]')
    await campo.fill('+376 312 345')
    await expect(campo).toHaveValue('+376 312 345')

    // O servidor: o número de Andorra tem 9 dígitos (o "10 com DDD" o recusava).
    const nome = `${PREFIXO} Estrangeira ${marca}`
    const dia = diaEmQueAUnidadeAbre(20)
    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', '/admin/agenda', [undefined], {
      _branchId: rede!.branchId, _slug: 'admin', client_name: nome, client_phone: '+376 312 345',
      procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      scheduled_at: new Date(`${dia}T10:00:00-03:00`).toISOString(), notes: '',
    })
    const id = /"id":"([0-9a-f-]{36})"/.exec(r.texto)?.[1]
    expect(id, r.texto.slice(0, 400)).toBeTruthy()
    agendamentos.push(id!)
    const { data } = await db().from('clients').select('phone').eq('tenant_id', rede!.tenantId).eq('name', nome).single<{ phone: string }>()
    expect(data!.phone).toBe('+376 312 345')
  } finally { await ctx.close() }
})
