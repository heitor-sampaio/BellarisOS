import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D14 da simulação de 2026-10-28: no mapa de injetáveis aberto FORA de um
 * atendimento, "Confirmar aplicação" dizia "Aplicação confirmada" — mas era
 * só estado da tela: salvar e recarregar devolvia o botão, e "Aplicações do
 * cliente (0)". É REGRA que a aplicação congelada (`injectable_applications`)
 * só nasce por "Registrar aplicação" DENTRO de um atendimento.
 *
 * De quem é cada regra:
 * - Fora do atendimento, nada de confirmar nem de dizer "confirmada" sem
 *   gravar: decisão do Claude na correção da frente C (2026-10-28), que o
 *   Heitor confirmou em 2026-10-29 (o DEVLOG registra a confirmação, sem fala
 *   dele sobre o botão).
 * - A frase "A aplicação se registra no atendimento…" saiu (o Heitor, 26/11:
 *   "isso não é ser intuitivo, é ser explicativo e não isso que eu quero.").
 * - Dentro do atendimento há um botão só (o Heitor, 27/11: "Um botão só,
 *   "Registrar aplicação" (a proposta)"): saiu o "Confirmar aplicação"; o
 *   registrar copia a dose prevista nos pontos sem a aplicada, e a coluna
 *   "Aplicado" fica sempre à vista. Antes, este teste clicava "Confirmar
 *   aplicação" e esperava "Aplicação confirmada".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let mapa = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ij${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`ijp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  cliente = await rede.criarCliente('Toxina')
  const { data, error } = await db().from('injectable_maps').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, name: `[e2e] Toxina terço superior ${marca}`,
    view: 'rosto_f',
    points: [{ id: 'p1', x: 0.5, y: 0.3, product: 'Toxina botulínica', dose: 20, unit: 'UI', applied: null, view: 'rosto_f' }],
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  mapa = data!.id
})
test.afterAll(async () => {
  if (cliente) await db().from('injectable_applications').delete().eq('client_id', cliente)
  if (rede) {
    await db().from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await profissional?.limpar(); await rede?.limpar()
})

// A8 da 37ª (o Heitor, 26/11: "isso não é ser intuitivo, é ser explicativo e
// não isso que eu quero. Ser intuitivo é justamente o contrario, ser facil de
// usar mesmo sem muitas explicações."): a frase "A aplicação se registra no
// atendimento…" da dica do mapa saiu; fora do atendimento, nada de confirmar.
test('fora do atendimento, o mapa não oferece "Confirmar aplicação"', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/injetaveis/${mapa}`)
    await expect(p.getByText('Aplicações do cliente (0)')).toBeVisible()
    await expect(p.getByRole('button', { name: 'Confirmar aplicação' }), 'nada de "confirmar" que não grava').toHaveCount(0)
    await expect(p.getByText(/A aplicação se registra no atendimento/)).toHaveCount(0)
    await expect(p.getByText('Aplicação confirmada', { exact: false })).toHaveCount(0)
  })
})

test('dentro do atendimento, um botão só: "Registrar aplicação" grava a dose prevista onde ninguém escreveu a aplicada', async ({ browser }) => {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${ag!.id}`)
    // D12 da 25ª: sem o Atendimento, a sessão não tem "Planejamento" (os planos
    // são do Atendimento); o mapa abre pelo "Mapa de injetáveis".
    await p.getByRole('main').getByRole('button', { name: 'Mapa de injetáveis' }).click()
    const janela = p.getByRole('dialog')
    await janela.getByText(`Toxina terço superior ${marca}`).click()
    await expect(janela.getByRole('button', { name: 'Confirmar aplicação' }), 'o segundo botão saiu').toHaveCount(0)
    // A coluna "Aplicado" já à vista. R44 (o Heitor, 28/11: "Vazio, com a dose do plano como sugestão (a
    // proposta)"): vazia até alguém escrever, com a dose que o registrar vai gravar como sugestão.
    const aplicado = janela.locator('[data-ponto-do-mapa]').first().getByLabel('Aplicado')
    await expect(aplicado).toHaveValue('')
    await expect(aplicado).toHaveAttribute('placeholder', '20')
    await janela.getByRole('button', { name: 'Registrar aplicação' }).click()
    await expect(janela.getByText('Aplicação registrada neste atendimento.')).toBeVisible()
  })
  const { data: aplicacoes } = await db().from('injectable_applications').select('appointment_id, points').eq('client_id', cliente)
  expect(aplicacoes?.map(a => a.appointment_id)).toEqual([ag!.id])
  expect((aplicacoes?.[0]?.points as { id: string; applied: number | null }[]).map(p => ({ id: p.id, applied: p.applied })),
    'a dose prevista vira a aplicada no registro').toEqual([{ id: 'p1', applied: 20 }])
})
