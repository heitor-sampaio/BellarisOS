import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * D5 (decisão do Heitor, 2026-10-30): as SALAS da unidade.
 *
 * A tabela `rooms` e a conferência de conflito de sala existiam, mas nenhum
 * código do app criava sala. Agora:
 * - Configurações → Unidades → a unidade: criar, renomear e desativar;
 * - o procedimento pode ser ligado às salas em que é feito (opcional: sem
 *   marcada, qualquer uma serve);
 * - o agendar oferece só as salas certas, sugere uma livre, e o servidor
 *   recusa a sala errada, a desativada e a ocupada;
 * - unidade sem sala: o agendar nem mostra o campo.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestora: MembroDeTeste | null = null
let segunda: MembroDeTeste | null = null
let semPermissao: MembroDeTeste | null = null
let outraRede: OutraRede | null = null
let slug = ''
let unidadeVazia = ''
let slugVazia = ''
let cliente = ''
const DIA = diaEmQueAUnidadeAbre(1)
const as = (hora: string) => new Date(`${DIA}T${hora}:00-03:00`).toISOString()

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function salasDaUnidade(branchId: string) {
  const { data, error } = await db().from('rooms').select('id, name, is_active').eq('branch_id', branchId).order('name')
  expect(error).toBeNull()
  return (data ?? []) as { id: string; name: string; is_active: boolean }[]
}

async function criarSalaNoBanco(branchId: string, nome: string) {
  const { data, error } = await db().from('rooms').insert({ branch_id: branchId, name: nome }).select('id').single<{ id: string }>()
  expect(error, `criar a sala ${nome}`).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`sa${marca}`)
  outraRede = await criarOutraRede(`sb${marca}`)
  const { data: b } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  slug = b!.slug
  const { data: v, error: eV } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade sem sala ${marca}`, slug: `e2e-sv-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(eV).toBeNull()
  unidadeVazia = v!.id; slugVazia = v!.slug

  expect((await db().from('users').update({ provides_services: true, branch_id: null }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ duration_min: 60, price: 100 }).eq('id', rede.procedureId)).error).toBeNull()

  gestora = await criarMembro(`sag${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' },
    ],
  })
  segunda = await criarMembro(`sap${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Segunda profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', segunda.userId)).error).toBeNull()
  semPermissao = await criarMembro(`sas${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Cliente da sala')
})

test.afterAll(async () => {
  for (const r of [rede, outraRede]) {
    if (!r) continue
    const unidades = r === rede ? [r.branchId, unidadeVazia].filter(Boolean) : [r.branchId]
    const { data: ags } = await db().from('appointments').select('id').in('branch_id', unidades)
    const ids = (ags ?? []).map(a => a.id as string)
    if (ids.length) await db().from('appointment_history').delete().in('appointment_id', ids)
    await db().from('appointments').delete().in('branch_id', unidades)
    await db().from('rooms').delete().in('branch_id', unidades)
  }
  await gestora?.limpar(); await segunda?.limpar(); await semPermissao?.limpar()
  if (unidadeVazia) await db().from('branches').delete().eq('id', unidadeVazia)
  await rede?.limpar(); await outraRede?.limpar()
})

test.describe.configure({ mode: 'serial' })

test('Configurações → Unidade: criar, renomear e desativar a sala', async ({ browser }) => {
  await como(browser, gestora!.estado, async p => {
    await p.goto(`/admin/branches/${rede!.branchId}`)
    const card = p.locator('[data-salas-da-unidade]')
    await expect(card.getByRole('heading', { name: 'Salas' })).toBeVisible()
    await expect(card).toContainText('Nenhuma sala cadastrada')

    for (const nome of ['Sala 1', 'Sala 2']) {
      await card.getByLabel('Nome da nova sala').fill(nome)
      await card.getByRole('button', { name: 'Adicionar sala' }).click()
      await expect(card.getByText(nome, { exact: true })).toBeVisible()
    }

    // Nome repetido na mesma unidade é recusado (caixa e espaço não contam).
    await card.getByLabel('Nome da nova sala').fill('  sala 1 ')
    await card.getByRole('button', { name: 'Adicionar sala' }).click()
    await expect(card.getByRole('alert')).toContainText('Já existe uma sala com este nome nesta unidade.')

    await card.getByRole('button', { name: 'Renomear Sala 2' }).click()
    await card.getByLabel('Novo nome de Sala 2').fill('Cabine laser')
    await card.getByRole('button', { name: 'Salvar nome' }).click()
    await expect(card.getByText('Cabine laser', { exact: true })).toBeVisible()

    await card.getByRole('button', { name: 'Desativar Sala 1' }).click()
    await expect(card.locator('[data-sala="Sala 1"]')).toContainText('Desativada')
  })
  const salas = await salasDaUnidade(rede!.branchId)
  expect(salas.map(s => [s.name, s.is_active])).toEqual([['Cabine laser', true], ['Sala 1', false]])
})

test('só quem configura a unidade mexe nas salas — e só nas da própria rede', async ({ browser }) => {
  const rota = `/admin/branches/${rede!.branchId}`
  // Controle: a gestora cria.
  await como(browser, gestora!.estado, async p => {
    const ok = await chamarAcao(p, 'actions/salas.ts', 'criarSala', rota, [rede!.branchId, `Controle ${marca}`])
    expect(ok.texto).toMatch(/"id":"[0-9a-f-]{36}"/)
    const alheia = await chamarAcao(p, 'actions/salas.ts', 'criarSala', rota, [outraRede!.branchId, `Alheia ${marca}`])
    expect(alheia.texto).toContain('Unidade não encontrada.')
  })
  await como(browser, semPermissao!.estado, async p => {
    const r = await chamarAcao(p, 'actions/salas.ts', 'criarSala', rota, [rede!.branchId, `Recepção ${marca}`])
    expect(r.texto).not.toMatch(/"id":"[0-9a-f-]{36}"/)
  })
  const nomes = [
    ...(await salasDaUnidade(rede!.branchId)).map(s => s.name),
    ...(await salasDaUnidade(outraRede!.branchId)).map(s => s.name),
  ]
  expect(nomes).toContain(`Controle ${marca}`)
  expect(nomes).not.toContain(`Alheia ${marca}`)
  expect(nomes).not.toContain(`Recepção ${marca}`)
  await db().from('rooms').update({ is_active: false }).eq('branch_id', rede!.branchId).eq('name', `Controle ${marca}`)
})

test('o procedimento se liga às salas em que é feito, pelo cadastro', async ({ browser }) => {
  await criarSalaNoBanco(rede!.branchId, 'Sala 3')
  await como(browser, gestora!.estado, async p => {
    await p.goto('/admin/procedures')
    await p.locator('tr', { hasText: `${PREFIXO} Proc sa${marca}` }).getByRole('button', { name: 'Editar' }).click()
    const grupo = p.locator('dialog[open]').getByRole('group', { name: 'Salas em que é feito' })
    // A desativada não se oferece.
    await expect(grupo.getByRole('button', { name: /Sala 1/ })).toHaveCount(0)
    await grupo.getByRole('button', { name: /Cabine laser/ }).click()
    await grupo.getByRole('button', { name: /Sala 3/ }).click()
    await p.locator('dialog[open]').getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(p.locator('dialog[open]')).toHaveCount(0, { timeout: 15_000 })
  })
  const { data } = await db().from('procedure_rooms').select('room_id, rooms(name)').eq('procedure_id', rede!.procedureId)
  expect((data ?? []).map(l => (l.rooms as unknown as { name: string }).name).sort()).toEqual(['Cabine laser', 'Sala 3'])
})

test('o agendar oferece só as salas do procedimento e sugere uma livre', async ({ browser }) => {
  const salas = await salasDaUnidade(rede!.branchId)
  const cabine = salas.find(s => s.name === 'Cabine laser')!.id
  // A Cabine já está ocupada às 10:00 (outra profissional).
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: segunda!.userId,
    room_id: cabine, scheduled_at: as('10:00'), duration_min: 60, price: 100, status: 'SCHEDULED', source: 'INTERNAL',
  })
  expect(error).toBeNull()

  await como(browser, gestora!.estado, async p => {
    const r = await chamarAcao(p, 'actions/appointments.ts', 'salasParaAgendar', `/${slug}/agenda`,
      [rede!.branchId, rede!.procedureId, as('10:00'), 60])
    expect(r.status, r.texto.slice(0, 300)).toBe(200)
    expect(r.texto).toContain('"name":"Cabine laser","livre":false')
    expect(r.texto).toContain('"name":"Sala 3","livre":true')
    expect(r.texto).not.toContain('"name":"Sala 1"')
    expect(r.texto).not.toContain(`"name":"Controle ${marca}"`)

    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const janela = p.locator('dialog[open]')
    await janela.getByPlaceholder('Buscar cliente por nome ou telefone…').fill(`Cliente da sala ${'sa' + marca}`)
    await janela.getByText(`${PREFIXO} Cliente da sala sa${marca}`).first().click()
    await janela.getByLabel('Procedimento *').selectOption(rede!.procedureId)
    await janela.getByLabel('Profissional *').selectOption(rede!.professionalId)
    await janela.getByLabel('Data e hora *').fill(`${DIA}T10:00`)
    const sala = janela.getByLabel('Sala / Cabine')
    await expect(sala.locator('option')).toHaveText(['Sem sala definida', 'Cabine laser (ocupada)', 'Sala 3'])
    await expect(sala.locator('option:checked')).toHaveText('Sala 3')
  })
})

test('o servidor recusa a sala que não faz o procedimento, a desativada e a ocupada', async ({ browser }) => {
  const salas = await salasDaUnidade(rede!.branchId)
  const id = (nome: string) => salas.find(s => s.name === nome)!.id
  const outroProc = (await db().from('procedures')
    .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Livre ${marca}`, category: 'e2e', duration_min: 30, price: 0 })
    .select('id').single<{ id: string }>()).data!.id
  const salaLivreDeTudo = await criarSalaNoBanco(rede!.branchId, `Sala 4 ${marca}`)

  await como(browser, gestora!.estado, async p => {
    const agendar = (campos: Record<string, string>) => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment',
      `/${slug}/agenda`, [undefined], {
        _branchId: rede!.branchId, _slug: slug, client_id: cliente, procedure_id: rede!.procedureId,
        professional_id: rede!.professionalId, notes: '', ...campos,
      })
    const naoFaz = await agendar({ room_id: salaLivreDeTudo, scheduled_at: as('14:00') })
    expect(naoFaz.texto).toContain('Esta sala não é usada para este procedimento.')
    const desativada = await agendar({ room_id: id('Sala 1'), scheduled_at: as('14:00') })
    expect(desativada.texto).toContain('Sala não encontrada nesta unidade.')
    const ocupada = await agendar({ room_id: id('Cabine laser'), scheduled_at: as('10:30') })
    expect(ocupada.texto).toContain('Esta sala já está ocupada nesse horário.')
    // Controle: a Sala 3, livre e ligada ao procedimento.
    const certa = await agendar({ room_id: id('Sala 3'), scheduled_at: as('14:00') })
    expect(certa.texto).toContain('"success":true')

    // Procedimento SEM sala ligada aceita qualquer sala ativa da unidade.
    const qualquer = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
      _branchId: rede!.branchId, _slug: slug, client_id: cliente, procedure_id: outroProc,
      professional_id: segunda!.userId, room_id: salaLivreDeTudo, scheduled_at: as('16:00'), notes: '',
    })
    expect(qualquer.texto).toContain('"success":true')
  })
  const { data } = await db().from('appointments').select('room_id').eq('branch_id', rede!.branchId).eq('scheduled_at', as('14:00'))
  expect((data ?? []).map(a => a.room_id)).toEqual([id('Sala 3')])
})

test('unidade sem nenhuma sala: o agendar não mostra o campo', async ({ browser }) => {
  await como(browser, gestora!.estado, async p => {
    await p.goto(`/${slugVazia}/agenda?date=${DIA}`)
    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const janela = p.locator('dialog[open]')
    await expect(janela.getByLabel('Profissional *')).toBeVisible()
    await expect(janela.getByLabel('Sala / Cabine')).toHaveCount(0)
  })
})
