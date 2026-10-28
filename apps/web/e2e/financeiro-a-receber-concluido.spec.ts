import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O atendimento concluído e não pago tem caminho pela tela (D5 da simulação
 * de 2026-10-27), e o de R$ 0 conclui sem cobrança (D9).
 *
 * A simulação achou: o cartão do atendimento concluído na agenda abria a
 * janela que só dizia "Este agendamento já foi encerrado.", e o "Confirmar
 * pagamento" existia só em `/[slug]/agenda/<id>`, que ninguém acha pela tela.
 * O Fechamento, a ficha e o financeiro não listavam o que está a receber, e o
 * "Vender" da ficha cobraria a limpeza de novo. A avaliação de R$ 0 ficava
 * "Aguardando confirmação de pagamento" para sempre.
 *
 * Decisões do Heitor (2026-10-27): a janela da agenda mostra "Receber
 * pagamento", que leva à tela que confirma (pelos dois portais); o Fechamento
 * ganha "Concluídos a receber"; a ficha mostra o atendimento a receber com o
 * mesmo botão, e o "Vender" avisa quando há um a receber do mesmo
 * procedimento. O de R$ 0 diz "Sem cobrança" e não entra em lista nenhuma.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let procLimpeza = ''
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const agendamentos: string[] = []

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um atendimento CONCLUÍDO hoje, sem pagamento. */
async function concluido(cliente: string, procedimento: string, preco: number, hora: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: procedimento, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: preco,
    scheduled_at: new Date(`${HOJE}T${String(hora).padStart(2, '0')}:00:00-03:00`).toISOString(),
    completed_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'concluir o atendimento').toBeNull()
  agendamentos.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ar${marca}`)
  // A grade da unidade mostra quem atende nela.
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: pr, error } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Limpeza ${marca}`, category: 'e2e', duration_min: 30, price: 180 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  procLimpeza = pr!.id
  // A recepção de sempre: agenda, clientes e RECEBER (cashier).
  recepcao = await criarMembro(`arr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (agendamentos.length) await db().from('financial_transactions').delete().in('appointment_id', agendamentos)
  await recepcao?.limpar()
  await rede?.limpar()
})

test.describe.serial('o atendimento concluído a receber', () => {
  let joana = ''
  let limpeza = ''
  let avaliacao = ''

  test.beforeAll(async () => {
    joana = await rede!.criarCliente('Joana')
    limpeza = await concluido(joana, procLimpeza, 180, 9)
    // A avaliação de R$ 0 (o procedimento padrão da rede [e2e] custa 0).
    avaliacao = await concluido(await rede!.criarCliente('Sofia'), rede!.procedureId, 0, 10)
  })

  test('D9: o atendimento de R$ 0 diz "Sem cobrança" e não espera pagamento', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/agenda/${avaliacao}`)
      await expect(p.getByText('Sem cobrança', { exact: false }).first()).toBeVisible()
      await expect(p.getByText(/Aguardando confirmação de pagamento/)).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Confirmar pagamento' })).toHaveCount(0)
    })
    // E o banco recusa "receber" R$ 0 — não nasce lançamento de zero.
    const { error } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: avaliacao, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: 'e2e',
      p_dados: { metodo: null, pontos: 0, desconto: 0, valor_final: 0, desconto_voucher: 0, desconto_venda: 0, cartao_vezes: 1 },
    })
    expect(error?.message ?? '').toMatch(/sem cobrança/i)
    const { data: tx } = await db().from('financial_transactions').select('id').eq('appointment_id', avaliacao)
    expect(tx ?? []).toHaveLength(0)
  })

  test('D5: a janela da agenda leva ao recebimento do concluído', async ({ browser }) => {
    // A grade de hoje rola sozinha para agora: o clique de mouse pode cair
    // noutro horário (e abrir o "Novo agendamento"). O evento vai direto ao
    // bloco — e, no next dev, pode chegar antes da hidratação da grade e se
    // perder (nem a leitura da cobrança sai): repete até a janela abrir.
    async function abrirJanela(p: Page, agendamento: string) {
      const janela = p.getByRole('dialog', { name: 'Agendamento' })
      await expect(async () => {
        if (!(await janela.isVisible())) await p.locator(`[data-agendamento="${agendamento}"]`).first().dispatchEvent('click')
        await expect(janela).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      return janela
    }
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/agenda?date=${HOJE}`)
      const receber = (await abrirJanela(p, limpeza)).getByRole('link', { name: 'Receber pagamento' })
      await expect(receber).toBeVisible()
      await receber.click()
      await expect(p).toHaveURL(new RegExp(`/${slug}/agenda/${limpeza}\\?receber=1`))
      await expect(p.getByRole('dialog', { name: 'Confirmar pagamento' })).toBeVisible()

      // A avaliação de R$ 0, na mesma janela: nada a receber.
      await p.goto(`/${slug}/agenda?date=${HOJE}`)
      await expect((await abrirJanela(p, avaliacao)).getByText('Sem cobrança')).toBeVisible()
      await expect(p.getByRole('link', { name: 'Receber pagamento' })).toHaveCount(0)
    })
  })

  test('D5: o Fechamento do dia lista os concluídos a receber (e não o de R$ 0)', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/fechamento`)
      const lista = p.locator('[data-a-receber]')
      await expect(lista).toBeVisible()
      const linha = lista.locator(`[data-agendamento="${limpeza}"]`)
      await expect(linha).toContainText(`Joana ar${marca}`)
      await expect(linha).toContainText(`Limpeza ${marca}`)
      await expect(linha).toContainText('180,00')
      await expect(lista.locator(`[data-agendamento="${avaliacao}"]`)).toHaveCount(0)
      await linha.getByRole('link', { name: 'Receber' }).click()
      await expect(p).toHaveURL(new RegExp(`/${slug}/agenda/${limpeza}\\?receber=1`))
    })
  })

  test('D5: a ficha mostra o atendimento a receber, e o "Vender" avisa do mesmo procedimento', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/clients/${joana}`)
      const card = p.locator('[data-a-receber]')
      await expect(card).toContainText(`Limpeza ${marca}`)
      await expect(card).toContainText('180,00')
      await expect(card.getByRole('link', { name: 'Receber' })).toHaveAttribute('href', `/${slug}/agenda/${limpeza}?receber=1`)

      await p.getByRole('button', { name: 'Vender', exact: true }).click()
      const venda = p.getByRole('dialog', { name: 'Vender' })
      await venda.getByLabel('Procedimento').selectOption(procLimpeza)
      await expect(venda.locator('[data-aviso-a-receber]')).toContainText(/a receber/i)
      await expect(venda.locator('[data-aviso-a-receber]')).toContainText('180,00')
    })
  })

  test('recebido, sai das listas', async ({ browser }) => {
    const { error } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: limpeza, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: 'e2e',
      p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: 180, desconto_voucher: 0, desconto_venda: 0, cartao_vezes: 1 },
    })
    expect(error).toBeNull()
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/fechamento`)
      await expect(p.locator(`[data-a-receber] [data-agendamento="${limpeza}"]`)).toHaveCount(0)
      await p.goto(`/${slug}/clients/${joana}`)
      await expect(p.locator(`[data-a-receber] [data-agendamento="${limpeza}"]`)).toHaveCount(0)
    })
  })
})
