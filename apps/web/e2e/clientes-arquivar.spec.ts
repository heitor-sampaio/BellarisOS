import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Arquivar a cliente (A24, simulação de 2026-10-27): a recepção não achou como
 * ("Desativar cliente" escondido no "..."), e a cliente arquivada seguia
 * contando como cliente NOVA no dashboard.
 *
 * J-23 (2026-10-30): arquivar não pedia confirmação, a ficha arquivada não
 * tinha marca, "Vender" e "+ Agendar" continuavam ativos (e o servidor
 * aceitava), e a lista não tinha o filtro "Arquivadas". J-25: o "+" de novo
 * cliente só tinha o `title`.
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
      await expect(p.getByRole('button', { name: 'Novo cliente' }), 'J-25: o "+" tem nome').toHaveAttribute('aria-label', 'Novo cliente')
      await p.getByRole('button', { name: 'Mais ações' }).click()
      await p.getByRole('button', { name: 'Arquivar cliente' }).click()
      // J-23: pede confirmação antes.
      const janela = p.getByRole('dialog', { name: 'Arquivar cliente?' })
      await expect(janela).toBeVisible()
      expect((await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active, 'nada antes de confirmar').toBe(true)
      await janela.getByRole('button', { name: 'Arquivar', exact: true }).click()
      await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', id).single()).data?.is_active).toBe(false)
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

  test('quem recebe vê o Vender desligado na ficha arquivada', async ({ browser }) => {
    const id = await rede!.criarCliente('Arquivada no caixa')
    expect((await db().from('clients').update({ is_active: false }).eq('id', id)).error).toBeNull()
    const ctx = await browser.newContext({ storageState: caixa!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/${slug}/clients/${id}`)
      const topo = p.locator('.card').filter({ has: p.locator('h1') }).first()
      await expect(topo.getByRole('button', { name: 'Vender' })).toBeDisabled()
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
      const vender = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/clients/${id}`,
        [id, rede!.procedureId, rede!.branchId, 1, null, { forma: 'AVISTA', metodo: 'PIX' }, null])
      expect(vender.texto).toContain('arquivada')
    } finally { await ctx.close() }
    expect((await db().from('appointments').select('id').eq('client_id', id)).data ?? [], 'nenhum agendamento').toHaveLength(0)
    expect((await db().from('procedure_sales').select('id').eq('client_id', id)).data ?? [], 'nenhuma venda').toHaveLength(0)
  })
})
