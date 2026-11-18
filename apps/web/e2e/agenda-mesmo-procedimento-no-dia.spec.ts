import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A22 da 23ª simulação: a segunda Avaliação da mesma cliente no mesmo dia
 * nascia sem aviso nenhum. O agendar avisa ("X já tem P neste dia, às 10:00.")
 * e continua permitindo (princípio 2: no máximo, avisar). Outro dia, nada.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let cliente = ''

/** Daqui a três dias, em Brasília (AAAA-MM-DD). */
function diaEmBrasilia(dias: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))
}
const DIA = diaEmBrasilia(3)
const OUTRO_DIA = diaEmBrasilia(4)

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`mn${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  cliente = await rede.criarCliente('Helena')
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(`${DIA}T10:00:00-03:00`).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  })).error).toBeNull()
  recepcao = await criarMembro(`mnr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const ids = (data ?? []).map(a => a.id as string)
    if (ids.length) await db().from('appointment_history').delete().in('appointment_id', ids)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test('A22: o mesmo procedimento da mesma cliente no mesmo dia avisa antes de confirmar, sem barrar', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  const p = await ctx.newPage()
  try {
    await p.goto(`/${slug}/agenda?novo=1&cliente=${cliente}`)
    const janela = p.getByRole('dialog', { name: 'Novo agendamento' })
    await janela.getByLabel('Procedimento *').selectOption(rede!.procedureId)
    await janela.getByLabel('Profissional *').selectOption(rede!.professionalId)
    const aviso = janela.locator('[data-aviso-mesmo-no-dia]')

    await janela.getByLabel('Data e hora *').fill(`${DIA}T15:30`)
    await expect(aviso).toContainText(`${PREFIXO} Helena mn${marca} já tem ${PREFIXO} Proc mn${marca} neste dia, às 10:00.`)
    // Só avisa: o Confirmar continua.
    await expect(janela.getByRole('button', { name: /^Confirmar/ })).toBeEnabled()

    await janela.getByLabel('Data e hora *').fill(`${OUTRO_DIA}T15:30`)
    await expect(aviso).toHaveCount(0)
  } finally { await ctx.close() }
})
