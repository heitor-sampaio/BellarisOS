import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * Arquivar a cliente (A24, simulação de 2026-10-27): a recepção não achou como
 * ("Desativar cliente" escondido no "..."), e a cliente arquivada seguia
 * contando como cliente NOVA no dashboard.
 *
 * J-23 (2026-10-30): arquivar não pedia confirmação, a ficha arquivada não
 * tinha marca, "Vender" e "+ Agendar" continuavam ativos (e o servidor
 * aceitava), e a lista não tinha o filtro "Arquivadas". J-25: o "+" de novo
 * cliente só tinha o `title`.
 *
 * A19 (5ª simulação, as sobras do J-23): arquivar não citava o agendamento
 * futuro, que continuava "Agendado"; a busca não achava a arquivada e
 * oferecia "Cadastrar … como cliente" (a duplicata); o "Vender" desligado
 * parecia ativo; e o menu "Mais ações" ficava aberto sobre o cabeçalho.
 *
 * PDV7 (2026-11-13): o "Vender" saiu da ficha — só se vende pelo PDV, que não
 * abre a venda para a arquivada.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let caixa: MembroDeTeste | null = null
let slug = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`ar${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // O cargo-modelo Recepcionista: agenda e clientes em Gerenciar.
  recepcao = await criarMembro(`arr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'loyalty', nivel: 'VIEW' }],
  })
  // Quem também recebe: é quem vê o Vender.
  caixa = await criarMembro(`arc${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => { await recepcao?.limpar(); await caixa?.limpar(); await rede?.limpar() })

const novosNoDashboard = async () => {
  const { data, error } = await db().rpc('metrics_core', {
    p_tenant: rede!.tenantId, p_branch_ids: null,
    p_from: new Date(Date.now() - 3_600_000).toISOString(), p_to: new Date(Date.now() + 3_600_000).toISOString(),
    p_professional_id: null,
  })
  expect(error).toBeNull()
  return Number((data as { new_clients: number }[])[0]!.new_clients)
}

const janela = () => ({ p_from: new Date(Date.now() - 3_600_000).toISOString(), p_to: new Date(Date.now() + 3_600_000).toISOString() })

test.describe.serial('arquivar a cliente', () => {
  test('a cliente arquivada não conta como nova — no cartão, por unidade e na série', async () => {
    const id = await rede!.criarCliente('Teste Cancelamento')
    expect(await novosNoDashboard()).toBe(1)
    expect((await db().from('clients').update({ is_active: false }).eq('id', id)).error).toBeNull()
    expect(await novosNoDashboard(), 'o cartão').toBe(0)
    const porUnidade = await db().rpc('metrics_by_branch', { p_tenant: rede!.tenantId, ...janela() })
    expect((porUnidade.data as { new_clients: number }[])[0]!.new_clients, 'por unidade').toBe(0)
    const serie = await db().rpc('metrics_new_clients_series', { p_tenant: rede!.tenantId, p_branch_ids: null, ...janela(), p_granularity: 'day' })
    expect(serie.data, 'a série').toEqual([])
    expect((await db().from('clients').update({ is_active: true }).eq('id', id)).error).toBeNull()
    expect(await novosNoDashboard(), 'reativada, volta').toBe(1)
  })

  test('a recepção arquiva e reativa pela ficha, no menu "Mais ações"', async ({ browser }) => {
    const id = await rede!.criarCliente('Arquivada pela recepção')
    // A lista da unidade mostra quem tem a tag dela.
    const { data: un } = await db().from('branches').select('name').eq('id', rede!.branchId).single<{ name: string }>()
    expect((await db().from('clients').update({ tags: [`Unidade: ${un!.name}`] }).eq('id', id)).error).toBeNull()
    const ctx = await browser.newContext({ storageState: recepcao!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/${slug}/clients/${id}`)
      // J-25 deu nome ao "+"; A22 (5ª simulação) pôs o texto à vista.
      await expect(p.getByRole('button', { name: 'Novo cliente' }), 'J-25/A22: o botão diz o que faz').toHaveText('Novo cliente')
      await p.getByRole('button', { name: 'Mais ações' }).click()
      await p.getByRole('button', { name: 'Arquivar cliente' }).click()
      // J-23: pede confirmação antes.
      const janela = p.getByRole('dialog', { name: 'Arquivar cliente?' })
      await expect(janela).toBeVisible()
      expect((await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active, 'nada antes de confirmar').toBe(true)
      await janela.getByRole('button', { name: 'Arquivar', exact: true }).click()
      await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active).toBe(false)
      // A action grava ANTES de expirar o cache da lista: recarregar só depois
      // que ela voltou (a janela fecha), senão a lista ainda vem do cache.
      await expect(janela).toBeHidden()
      await p.reload()
      // A ficha arquivada tem marca, e o agendar fica desligado.
      const topo = p.locator('.card').filter({ has: p.locator('h1') }).first()
      await expect(topo.getByText('Arquivada', { exact: true })).toBeVisible()
      await expect(topo.getByRole('button', { name: '+ Agendar' })).toBeDisabled()
      // A lista tem o filtro "Arquivadas", e ela está lá.
      const lista = p.locator('.clients-master-list')
      await expect(lista.getByText('Arquivada pela recepção')).toHaveCount(0)
      await lista.getByRole('button', { name: 'Situação' }).click()
      await p.locator('[data-painel-picker]').getByRole('button', { name: 'Arquivadas' }).click()
      await expect(lista.getByText(/Arquivada pela recepção/)).toBeVisible()
      await p.getByRole('button', { name: 'Mais ações' }).click()
      await p.getByRole('button', { name: 'Reativar cliente' }).click()
      await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active).toBe(true)
    } finally { await ctx.close() }
  })

  // Só se vende pelo PDV (PDV7, 2026-11-13): a ficha não tem mais o "Vender".
  // A prova nova é que o PDV não abre a venda para a arquivada (volta a pedir a cliente).
  test('quem recebe não abre a venda da arquivada no PDV', async ({ browser }) => {
    const id = await rede!.criarCliente('Arquivada no caixa')
    expect((await db().from('clients').update({ is_active: false }).eq('id', id)).error).toBeNull()
    const ctx = await browser.newContext({ storageState: caixa!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/${slug}/clients/${id}`)
      const topo = p.locator('.card').filter({ has: p.locator('h1') }).first()
      await expect(topo.getByText('Arquivada', { exact: true })).toBeVisible()
      await expect(topo.getByRole('button', { name: 'Vender' })).toHaveCount(0)
      await p.goto(`/${slug}/pdv?nova=1&cliente=${id}`)
      const venda = p.getByRole('region', { name: 'Vender' })
      await expect(venda.getByLabel('Cliente da venda')).toBeVisible()
      await expect(venda.locator('[data-cliente-da-venda]')).toHaveCount(0)
    } finally { await ctx.close() }
  })

  test('o servidor recusa agendar e vender para a cliente arquivada', async ({ browser }) => {
    const id = await rede!.criarCliente('Arquivada no servidor')
    expect((await db().from('clients').update({ is_active: false }).eq('id', id)).error).toBeNull()
    const dia = diaEmQueAUnidadeAbre(5)
    const ctx = await browser.newContext({ storageState: caixa!.estado })
    try {
      const p = await ctx.newPage()
      const agendar = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
        _branchId: rede!.branchId, _slug: slug, client_id: id, procedure_id: rede!.procedureId,
        professional_id: rede!.professionalId, scheduled_at: new Date(`${dia}T10:00:00-03:00`).toISOString(), notes: '',
      })
      expect(agendar.texto).toContain('arquivada')
      const vender = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`,
        [id, rede!.procedureId, rede!.branchId, 1, null, { forma: 'AVISTA', metodo: 'PIX' }, null])
      expect(vender.texto).toContain('arquivada')
    } finally { await ctx.close() }
    expect((await db().from('appointments').select('id').eq('client_id', id)).data ?? [], 'nenhum agendamento').toHaveLength(0)
    expect((await db().from('procedure_sales').select('id').eq('client_id', id)).data ?? [], 'nenhuma venda').toHaveLength(0)
  })

  const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  test('A19: arquivar avisa do agendamento futuro, e o menu fecha depois de arquivar', async ({ browser }) => {
    const id = await rede!.criarCliente('Arquivar com horário')
    const dia = diaEmQueAUnidadeAbre(9)
    const { data: ag, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: id, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
      scheduled_at: new Date(`${dia}T10:00:00-03:00`).toISOString(), duration_min: 60, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const ctx = await browser.newContext({ storageState: recepcao!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/${slug}/clients/${id}`)
      await p.getByRole('button', { name: 'Mais ações' }).click()
      await p.getByRole('button', { name: 'Arquivar cliente' }).click()
      const janela = p.getByRole('dialog', { name: 'Arquivar cliente?' })
      const [, mes, d] = dia.split('-')
      await expect(janela).toContainText('1 agendamento marcado')
      await expect(janela).toContainText(`${d}/${mes}`)
      await janela.getByRole('button', { name: 'Arquivar', exact: true }).click()
      await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active).toBe(false)
      await expect(p.getByRole('button', { name: 'Reativar cliente' }), 'o menu fechou').toHaveCount(0)
      await expect(p.locator('.card').filter({ has: p.locator('h1') }).first().getByText('Arquivada', { exact: true })).toBeVisible()
    } finally {
      await ctx.close()
      expect(await apagarAgendamentos([ag!.id])).toEqual([])
    }
  })

  // "A19: o Vender desligado PARECE desligado" saiu: a ficha não tem mais o
  // "Vender" (PDV7, 2026-11-13 — só se vende pelo PDV).

  test('A19: a busca acha a arquivada e oferece "Reativar", não "Cadastrar … como cliente"', async ({ browser }) => {
    const nome = `Valdir Busca ${marca}`
    const id = await rede!.criarCliente(nome)
    const { data: c } = await db().from('clients').select('name').eq('id', id).single<{ name: string }>()
    expect((await db().from('clients').update({ is_active: false }).eq('id', id)).error).toBeNull()
    const ctx = await browser.newContext({ storageState: recepcao!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/${slug}/dashboard`)
      const campo = p.getByRole('combobox', { name: 'Busca universal' })
      await campo.fill(`valdir busca ${marca}`)
      const linha = p.getByRole('option', { name: new RegExp(`${escapar(c!.name)}.*Arquivada`) })
      await expect(linha).toBeVisible({ timeout: 15_000 })
      await expect(p.getByRole('option', { name: /como cliente/ })).toHaveCount(0)
      await p.getByRole('option', { name: `Reativar ${c!.name}` }).click()
      await expect(p).toHaveURL(new RegExp(`/clients/${id}`), { timeout: 20_000 })
      // A ficha abre com o "Reativar cliente" à vista.
      await p.getByRole('button', { name: 'Reativar cliente' }).click()
      await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active).toBe(true)
    } finally { await ctx.close() }
  })
})
