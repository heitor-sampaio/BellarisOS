import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { abrirVendaNoPdv } from './apoio/vender'

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
 * Decisões do Heitor (2026-10-27): a janela da agenda mostra o caminho do
 * recebimento (pelos dois portais); a ficha mostra o atendimento a receber, e
 * o "Vender" avisa quando há um a receber do mesmo procedimento. O de R$ 0 diz
 * "Sem cobrança" e não entra em lista nenhuma.
 *
 * Desde o PDV (PDV7 e CX3 da revisão de 2026-11-13: "Sai a cobrança da
 * conclusão do atendimento como porta própria (vira a comanda)"; "Os
 * 'Concluídos a receber' viram as comandas abertas do PDV (sai a lista à parte
 * na agenda, no Fechamento e na ficha)"): todo caminho leva à COMANDA do
 * atendimento no PDV (`/<portal>/pdv?unidade=…&comanda=…`). A tela do
 * atendimento não tem janela de pagamento própria, e a ficha não tem lista à
 * parte — tem o resumo das comandas abertas dela, com "Receber no PDV".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let procLimpeza = ''
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const agendamentos: string[] = []
/** A comanda aberta do atendimento (nasce no gatilho, PDV3). */
const comandaDo = async (agendamentoId: string) => {
  const { data, error } = await db().from('comandas').select('id').eq('appointment_id', agendamentoId)
    .is('cancelada_em', null).single<{ id: string }>()
  expect(error, 'a comanda do atendimento').toBeNull()
  return data!.id
}

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

  test('D5 + CX3: a janela da agenda leva à comanda do concluído no PDV', async ({ browser }) => {
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
      const comanda = await comandaDo(limpeza)
      const receber = (await abrirJanela(p, limpeza)).getByRole('link', { name: 'Receber no PDV' })
      await expect(receber).toHaveAttribute('href', `/${slug}/pdv?unidade=${rede!.branchId}&comanda=${comanda}`)
      await receber.click()
      await expect(p.locator(`[data-comanda-aberta="${comanda}"]`)).toBeVisible()
      await expect(p.locator(`[data-comanda-aberta="${comanda}"]`).getByRole('button', { name: /Receber R\$\s?180,00/ })).toBeVisible()

      // A avaliação de R$ 0, na mesma janela: nada a receber.
      await p.goto(`/${slug}/agenda?date=${HOJE}`)
      await expect((await abrirJanela(p, avaliacao)).getByText('Sem cobrança')).toBeVisible()
      await expect(p.getByRole('link', { name: 'Receber no PDV' })).toHaveCount(0)
    })
  })

  test('PDV7: a tela do atendimento concluído não abre janela de pagamento — leva à comanda no PDV', async ({ browser }) => {
    const comanda = await comandaDo(limpeza)
    await como(recepcao!, browser, async p => {
      // O endereço antigo (`?receber=1`) não abre janela nenhuma.
      await p.goto(`/${slug}/agenda/${limpeza}?receber=1`)
      await expect(p.getByText('Aguardando o pagamento no PDV')).toBeVisible()
      await expect(p.getByRole('dialog', { name: 'Confirmar pagamento' })).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Confirmar pagamento' })).toHaveCount(0)
      await expect(p.getByRole('link', { name: 'Receber no PDV' }).first())
        .toHaveAttribute('href', `/${slug}/pdv?unidade=${rede!.branchId}&comanda=${comanda}`)
    })
  })

  test('CX5: o Fechamento do dia (no PDV) não lista mais os concluídos — avisa das comandas abertas', async ({ browser }) => {
    // A lista "Concluídos a receber" saiu do fechamento (CX5, 2026-11-14): o
    // concluído sem pagamento é uma comanda aberta do PDV (CX3), e o
    // fechamento só avisa quantas há, com o link para elas.
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/pdv?fechar=1`)
      await expect(p.locator('[data-aviso="comandas-abertas"]')).toBeVisible()
      await expect(p.locator('[data-a-receber]')).toHaveCount(0)
    })
  })

  test('CX3: a ficha não tem a lista à parte — as comandas abertas dela levam ao PDV; a venda no PDV avisa do mesmo procedimento', async ({ browser }) => {
    const comanda = await comandaDo(limpeza)
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/clients/${joana}`)
      const card = p.locator('[data-comandas-abertas]')
      await expect(card).toContainText('180,00')
      await expect(p.getByText('Atendimentos a receber')).toHaveCount(0)
      await expect(p.locator('[data-a-receber]')).toHaveCount(0)
      const receber = card.getByRole('link', { name: 'Receber no PDV' })
      await expect(receber).toHaveAttribute('href', `/${slug}/pdv?unidade=${rede!.branchId}&comanda=${comanda}`)
      await receber.click()
      await expect(p.locator(`[data-comanda-aberta="${comanda}"]`)).toBeVisible()

      // Só se vende pelo PDV (PDV7, 2026-11-13): o aviso segue no formulário de lá.
      const venda = await abrirVendaNoPdv(p, `/${slug}`, joana)
      await venda.getByLabel('Procedimento').selectOption(procLimpeza)
      await expect(venda.locator('[data-aviso-a-receber]')).toContainText(/a receber/i)
      await expect(venda.locator('[data-aviso-a-receber]')).toContainText('180,00')
      await expect(venda.locator('[data-aviso-a-receber]').getByRole('link', { name: 'Receber o atendimento' }))
        .toHaveAttribute('href', `/${slug}/pdv?unidade=${rede!.branchId}&comanda=${comanda}`)
    })
  })

  test('recebido, sai das listas', async ({ browser }) => {
    const { error } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: limpeza, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: 'e2e',
      p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: 180, desconto_voucher: 0, desconto_venda: 0, cartao_vezes: 1 },
    })
    expect(error).toBeNull()
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/clients/${joana}`)
      await expect(p.getByText(`Joana ar${marca}`).first()).toBeVisible()
      await expect(p.locator('[data-comandas-abertas]')).toHaveCount(0)
    })
  })
})
