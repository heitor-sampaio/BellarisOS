import { test, expect, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A49 da 6ª simulação (2026-11-04): com o envio automático da rede DESLIGADO
 * (o padrão — princípio 6), a ficha de pré-atendimento não tinha caminho
 * nenhum: o "Enviar a ficha" da janela do agendamento só existia com um
 * pendente, e o pendente só nascia pelo envio automático. Quatro papéis do
 * time B procuraram e não acharam.
 *
 * Agora o "Enviar a ficha" está SEMPRE na janela (agenda em Gerenciar): ele
 * abre o pendente na hora, para ESTE agendamento, e gera o link. O padrão da
 * rede não muda. Nenhuma mensagem sai: o link volta para copiar.
 */

const marca = Date.now().toString(36)
const db = () => banco()

let R: OutraRede
let recepcao: MembroDeTeste
let soVe: MembroDeTeste
const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 2 * 24 * 3600_000))
let hora = 8

const novoCpf = () => {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  for (const n of [9, 10]) d.push(((d.reduce((s, x, i) => s + x * (n + 1 - i), 0) * 10) % 11) % 10)
  return d.join('')
}

async function agendada(rotulo: string) {
  const cliente = await R.criarCliente(rotulo)
  expect((await db().from('clients').update({ document: novoCpf() }).eq('id', cliente)).error).toBeNull()
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: R.branchId, client_id: cliente, procedure_id: R.procedureId, professional_id: R.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', scheduled_at: new Date(`${DIA}T${String(hora++).padStart(2, '0')}:00:00-03:00`).toISOString(), duration_min: 30, price: 0,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { cliente, agendamento: ap!.id }
}

const pendentesDe = async (cliente: string) => (await db().from('pre_atendimentos')
  .select('id, status, modo, appointment_id').eq('client_id', cliente).eq('status', 'PENDENTE')).data ?? []

async function gerarLink(browser: Browser, agendamento: string, quem: MembroDeTeste) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  const page = await ctx.newPage()
  try {
    const r = await chamarAcao(page, 'actions/pre-atendimento.ts', 'gerarLinkDoPreAtendimento', `/admin/agenda`, [agendamento])
    return /\/pre-atendimento\/([A-Za-z0-9_-]{43})/.exec(r.texto)?.[1] ?? ''
  } finally {
    await ctx.close()
  }
}

test.describe('A49: a ficha de pré-atendimento se manda à mão, com o envio automático desligado', () => {
  test.beforeAll(async () => {
    R = await criarOutraRede(`pm${marca}`)
    const { data: rede } = await db().from('tenants').select('pre_atendimento_envio').eq('id', R.tenantId).single()
    expect(rede?.pre_atendimento_envio, 'a rede nasce com o envio automático desligado').toBe(false)
    recepcao = await criarMembro(`pmr${marca}`, { tenant: R.tenantId, permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }] })
    soVe = await criarMembro(`pmv${marca}`, { tenant: R.tenantId, permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  })
  test.afterAll(async () => { await soVe?.limpar(); await recepcao?.limpar(); await R?.limpar() })

  test('na janela do agendamento, "Enviar a ficha" abre o pendente na hora e dá o link', async ({ browser }) => {
    const { cliente, agendamento } = await agendada('Manual')
    expect(await pendentesDe(cliente), 'com o envio desligado, agendar não abre nada').toEqual([])

    const ctx = await browser.newContext({ storageState: recepcao.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/admin/agenda?date=${DIA}`)
      await page.locator(`[title*="Manual pm${marca}"]`).first().click()
      const ficha = page.locator('[data-pre-atendimento-do-agendamento]')
      await expect(ficha.getByText('A ficha de saúde não foi enviada para este agendamento.')).toBeVisible()
      await ficha.getByRole('button', { name: 'Enviar a ficha' }).click()
      await expect(ficha.getByLabel('Link da ficha')).toHaveValue(/\/pre-atendimento\/[A-Za-z0-9_-]{43}$/)
      await expect(ficha.getByRole('link', { name: 'Abrir no WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/55/)
    } finally {
      await ctx.close()
    }

    const pendentes = await pendentesDe(cliente)
    expect(pendentes, 'o pendente nasceu, ligado a este agendamento').toEqual([
      expect.objectContaining({ status: 'PENDENTE', modo: 'COMPLETO', appointment_id: agendamento }),
    ])
    const { data: rede } = await db().from('tenants').select('pre_atendimento_envio').eq('id', R.tenantId).single()
    expect(rede?.pre_atendimento_envio, 'o padrão da rede continua desligado').toBe(false)
  })

  test('respondida há pouco, a equipe ainda manda — e a cliente só confirma que nada mudou', async ({ browser }) => {
    const { cliente, agendamento } = await agendada('Recente')
    // A resposta de 10 dias atrás: o envio automático não abriria nada (30 dias); o manual é escolha da clínica.
    expect((await db().from('medical_records').upsert({
      client_id: cliente,
      general_anamnesis: { versao: 2, ficha: { formId: null, nome: 'x', rows: [] }, respostas: { allergies: 'Não' }, respondidoEm: new Date(Date.now() - 10 * 86_400_000).toISOString(), origem: 'CLIENTE_APP' },
    }, { onConflict: 'client_id' })).error).toBeNull()
    expect(await gerarLink(browser, agendamento, recepcao), 'o link sai').not.toBe('')
    expect(await pendentesDe(cliente)).toEqual([expect.objectContaining({ modo: 'CONFIRMAR', appointment_id: agendamento })])
  })

  test('quem só vê a agenda não manda — nem abre o pendente', async ({ browser }) => {
    const { cliente, agendamento } = await agendada('So ve')
    expect(await gerarLink(browser, agendamento, soVe)).toBe('')
    expect(await pendentesDe(cliente)).toEqual([])
  })
})
