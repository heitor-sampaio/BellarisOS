import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { dayKeyTZ } from '../lib/datetime'

/**
 * O CRM da 9ª simulação (2026-11-07), pelas regras de sempre:
 * - D11: a oportunidade criada com o telefone de uma cliente nascia sem aviso
 *   e sem ligar à ficha (o inverso — cadastrar a cliente com o telefone de um
 *   lead — já perguntava "É a mesma pessoa?").
 * Numa rede [e2e] própria.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const fim = String(Date.now()).slice(-4)
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let sdr: MembroDeTeste
let funil = ''
const etapa: Record<'novo' | 'negociacao' | 'ganho' | 'perdido', string> = { novo: '', negociacao: '', ganho: '', perdido: '' }
let camila = ''
const foneDaCamila = `(48) 9${fim}-3131`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cr9${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: f } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'Vendas', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  funil = f!.id
  const etapas = [['novo', 'Novo', 'OPEN'], ['negociacao', 'Em negociação', 'OPEN'], ['ganho', 'Fechado', 'WON'], ['perdido', 'Perdido', 'LOST']] as const
  for (const [i, [k, n, o]] of etapas.entries()) {
    const { data } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: funil, name: n, color: '#c34d6b', position: i, outcome: o }).select('id').single<{ id: string }>()
    etapa[k] = data!.id
  }
  const { data: c, error } = await db().from('clients').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, name: nome('Camila Duarte'), phone: foneDaCamila,
  }).select('id').single<{ id: string }>()
  expect(error, 'a ficha da Camila').toBeNull()
  camila = c!.id
  sdr = await criarMembro(`cr9s${marca}`, {
    tenant: rede.tenantId, rotulo: 'SDR',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await sdr?.limpar()
  await rede?.limpar()
})

test('D11: o lead com o telefone de uma cliente pergunta se é ela e, com o "Sim", nasce ligado à ficha', async ({ browser }) => {
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    await p.getByRole('button', { name: 'Nova oportunidade' }).click()
    const janela = p.locator('dialog[open]')
    await janela.getByLabel('Nome *').fill(nome('Camila D. (repetida)'))
    await janela.getByLabel('Telefone').fill(foneDaCamila)
    const pergunta = janela.locator('[data-ficha-do-telefone]')
    await expect(pergunta).toContainText(`Este telefone é da ficha de ${nome('Camila Duarte')}`)

    // Sem responder, não cria — e diz o que falta.
    await janela.getByRole('button', { name: 'Criar oportunidade' }).click()
    await expect(janela).toContainText('Responda antes de criar')
    expect((await db().from('leads').select('id').eq('tenant_id', rede.tenantId).eq('name', nome('Camila D. (repetida)'))).data).toEqual([])

    await pergunta.getByRole('button', { name: 'Sim, é ela' }).click()
    await janela.getByRole('button', { name: 'Criar oportunidade' }).click()
    await expect(p.locator('dialog[open]')).toHaveCount(0)
  })
  await expect.poll(async () => (await db().from('leads').select('client_id')
    .eq('tenant_id', rede.tenantId).eq('name', nome('Camila D. (repetida)')).maybeSingle()).data?.client_id,
  { message: 'a oportunidade nasce ligada à ficha' }).toBe(camila)
})

async function lead(rotulo: string, campos: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: nome(rotulo), phone: `5548${fim}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    crm_stage_id: etapa.novo, ...campos,
  }).select('id, contato_id').single<{ id: string; contato_id: string }>()
  expect(error, `criar o lead ${rotulo}`).toBeNull()
  return data!.id
}

test('A43: "Ir para a conversa" numa rede sem WhatsApp diz que não há canal, e não cria conversa', async ({ browser }) => {
  const id = await lead('Instagram A43', { source: 'Instagram' })
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    await p.locator(`[data-lead-id="${id}"]`).click()
    const janela = p.locator('dialog[open]')
    await janela.getByRole('button', { name: 'Ir para a conversa' }).click()
    await expect(janela).toContainText('não tem um WhatsApp conectado')
    await expect(p).toHaveURL(/\/admin\/oportunidades/)
  })
  const { data: l } = await db().from('leads').select('contato_id').eq('id', id).single<{ contato_id: string }>()
  const { data: conversas } = await db().from('conversations').select('id').eq('tenant_id', rede.tenantId).eq('contato_id', l!.contato_id)
  expect(conversas, 'nenhuma conversa de WhatsApp nasce sem canal').toEqual([])
})

test('A44: o resumo diz a base da conversão, e "1 perdido" leva à coluna Perdido', async ({ browser }) => {
  await lead('Perdido A44', { crm_stage_id: etapa.perdido, perdido_em: new Date().toISOString() })
  await como(browser, sdr, async p => {
    await p.setViewportSize({ width: 1100, height: 800 })
    await p.goto('/admin/oportunidades')
    const resumo = p.locator('[data-resumo-do-quadro]')
    await expect(resumo).toContainText('ganhas de')
    await expect(resumo).toContainText('oportunidades do funil (abertas, ganhas e perdidas)')
    const coluna = p.locator('[data-coluna-desfecho="LOST"]')
    await expect(coluna).not.toBeInViewport({ ratio: 0.9 })
    await resumo.getByRole('button', { name: /1 perdido/ }).click()
    await expect(coluna).toBeInViewport({ ratio: 0.9 })
  })
})

test('A42: o lembrete de retorno se marca no card, com o dia e o que fazer, e o card diz quando', async ({ browser }) => {
  const id = await lead('Retorno A42')
  const hoje = dayKeyTZ(new Date())
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    await p.locator(`[data-lead-id="${id}"]`).click()
    const janela = p.locator('dialog[open]')
    await janela.getByLabel('Retornar em').fill(hoje)
    await janela.getByLabel('O que fazer no retorno').fill('Ligar para falar do orçamento')
    await janela.getByRole('button', { name: 'Salvar' }).click()
    await expect(p.locator('dialog[open]')).toHaveCount(0)
    await expect(p.locator(`[data-lead-id="${id}"] [data-retornar-em]`)).toContainText('Retornar hoje')
  })
  const { data } = await db().from('leads').select('retornar_em, retornar_obs, crm_stage_id').eq('id', id).single()
  expect(data).toEqual({ retornar_em: hoje, retornar_obs: 'Ligar para falar do orçamento', crm_stage_id: etapa.novo })
})

test('A7 da 35ª: no card perdido ou ganho, o lembrete fica com o dia, sem o destaque de hoje (OP-33, Decisão C2)', async ({ browser }) => {
  const hoje = dayKeyTZ(new Date())
  const dia = `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`
  const perdido = await lead('Retorno perdido A7', { retornar_em: hoje, crm_stage_id: etapa.perdido })
  const ganho = await lead('Retorno ganho A7', { retornar_em: hoje, crm_stage_id: etapa.ganho })
  const aberto = await lead('Retorno aberto A7', { retornar_em: hoje })
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    for (const id of [perdido, ganho]) {
      const r = p.locator(`[data-lead-id="${id}"] [data-retornar-em]`)
      await expect(r).toContainText(`Retornar ${dia}`)
      await expect(r).not.toContainText('hoje')
    }
    await expect(p.locator(`[data-lead-id="${aberto}"] [data-retornar-em]`)).toContainText('Retornar hoje')
  })
})

/**
 * O card e o "Ir para a conversa" (A16, A17 e A18 da 27ª simulação):
 * - A16 (CLAUDE.md §14; "quem só pode ver só pode ver"): com o CRM em Ver, o
 *   "Ir para a conversa" criava a conversa; agora diz o que falta, no alto do
 *   modal, e o modal diz "Só leitura".
 * - A17 (a origem é a ORIGEM; a tag é o filtro da rede): a origem e a tag eram o
 *   mesmo chip, a tag com o nome da origem sumia, e o painel das tags era
 *   cortado pelo modal.
 * - A18 (o Heitor, 24/11, "1": o card sempre mostra o nome do contato): duas
 *   oportunidades do mesmo contato mostravam a cópia de cada uma.
 */
test('A16 da 27ª: com o CRM em Ver, "Ir para a conversa" não cria a conversa e diz por quê; o modal diz "Só leitura"', async ({ browser }) => {
  const id = await lead('Sem conversa A16', { phone: null, email: `a16-${marca}@bellaris.invalid` })
  const leitor = await criarMembro(`cr9v${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê o CRM',
    permissoes: [{ modulo: 'crm', nivel: 'VIEW' }],
  })
  try {
    await como(browser, leitor, async p => {
      await p.goto('/admin/oportunidades')
      await p.locator(`[data-lead-id="${id}"]`).click()
      const janela = p.locator('dialog[open]')
      await expect(janela.locator('[data-oportunidade-so-leitura]')).toContainText('Só leitura')
      await janela.getByRole('button', { name: 'Ir para a conversa' }).click()
      const erro = janela.locator('[data-erro-da-conversa]')
      await expect(erro).toContainText('Abrir uma conversa nova pede o CRM em Gerenciar')
      await expect(erro).toBeInViewport()
      await expect(p).toHaveURL(/\/admin\/oportunidades/)
    })
    const { data: l } = await db().from('leads').select('contato_id').eq('id', id).single<{ contato_id: string }>()
    const { data: conversas } = await db().from('conversations').select('id').eq('tenant_id', rede.tenantId).eq('contato_id', l!.contato_id)
    expect(conversas, 'quem só vê não cria conversa').toEqual([])
  } finally {
    await leitor.limpar()
  }
})

test('A17 da 27ª: a origem não é o chip da tag, a tag com o nome da origem aparece, e o painel das tags cabe inteiro', async ({ browser }) => {
  const id = await lead('Indicada A17', { source: 'Indicação' })
  const { data: l } = await db().from('leads').select('contato_id').eq('id', id).single<{ contato_id: string }>()
  expect((await db().from('contacts').update({ tags: ['Indicação'] }).eq('id', l!.contato_id)).error).toBeNull()
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    const card = p.locator(`[data-lead-id="${id}"]`)
    await expect(card.locator('[data-origem-do-card]')).toHaveAttribute('title', 'Origem: Indicação')
    // A origem (texto com ícone) e a tag (a pílula) — as duas.
    await expect(card.getByText('Indicação', { exact: true })).toHaveCount(2)

    await card.click()
    const janela = p.locator('dialog[open]')
    await janela.getByRole('button', { name: 'Editar tags' }).click()
    const painel = p.locator('[data-painel-picker]')
    await expect(painel).toBeVisible()
    expect(await painel.evaluate(el => el.matches(':popover-open')), 'o painel na camada de cima').toBe(true)
    await expect(painel).toBeInViewport({ ratio: 1 })
    await expect(painel.getByRole('button', { name: 'Indicação' })).toBeVisible()
  })
})

test('A18 da 27ª: duas oportunidades do mesmo contato mostram o nome do contato', async ({ browser }) => {
  const primeira = await lead('Betânia Correia A18')
  const { data: l } = await db().from('leads').select('contato_id').eq('id', primeira).single<{ contato_id: string }>()
  expect((await db().from('contacts').update({ name: nome('Betânia Correia') }).eq('id', l!.contato_id)).error).toBeNull()
  const segunda = await lead('Betânia C. A18', { contato_id: l!.contato_id })
  await como(browser, sdr, async p => {
    await p.goto('/admin/oportunidades')
    for (const id of [primeira, segunda]) {
      const card = p.locator(`[data-lead-id="${id}"]`)
      await expect(card).toContainText(nome('Betânia Correia'))
      await expect(card).not.toContainText('Betânia C. A18')
    }
  })
})

/**
 * A5 da 32ª simulação (princípio 7):
 * - no modal de quem tem o CRM em Ver ("Só leitura"), os campos desligados
 *   tinham a cara de campo para digitar — agora têm o fundo do card e a linha fina;
 * - o filtro "Etapa" do inbox misturava as etapas de funis diferentes; com
 *   mais de um funil e nenhum escolhido, a etapa diz o funil ("Funil · Etapa"),
 *   e escolhido o funil, só as dele.
 */
test('no "Só leitura", os campos da oportunidade têm a aparência de leitura', async ({ browser }) => {
  const id = await lead('Só leitura A5')
  const leitor = await criarMembro(`cr9l${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê o CRM (A5)',
    permissoes: [{ modulo: 'crm', nivel: 'VIEW' }],
  })
  try {
    await como(browser, leitor, async p => {
      await p.goto('/admin/oportunidades')
      await p.locator(`[data-lead-id="${id}"]`).click()
      const janela = p.locator('dialog[open]')
      await expect(janela.locator('[data-oportunidade-so-leitura]')).toContainText('Só leitura')
      const campo = janela.getByLabel('Nome *')
      await expect(campo).toBeDisabled()
      const aparencia = await campo.evaluate(el => {
        const ref = document.createElement('div')
        ref.style.background = 'var(--surface)'
        ref.style.borderColor = 'var(--hairline)'
        document.body.appendChild(ref)
        const r = getComputedStyle(ref)
        const c = getComputedStyle(el)
        const out = { fundo: c.backgroundColor === r.backgroundColor, borda: c.borderTopColor === r.borderTopColor, cursor: c.cursor }
        ref.remove()
        return out
      })
      expect(aparencia).toEqual({ fundo: true, borda: true, cursor: 'default' })
    })
  } finally {
    await leitor.limpar()
  }
})

/**
 * A9 da 38ª simulação (CLAUDE.md §14; princípio 7): no "Só leitura", o seletor
 * mantinha a seta, a data o "dd/mm/aaaa", o "Preencha pelo menos um dos campos
 * abaixo" seguia à vista e os procedimentos eram botões de marcar. Quem só vê
 * lê os valores.
 */
test('A9 da 38ª: no "Só leitura", sem seletor, sem convite a preencher e os procedimentos como texto', async ({ browser }) => {
  const id = await lead('Só leitura A9')
  const leitor = await criarMembro(`cr9n${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê o CRM (A9)',
    permissoes: [{ modulo: 'crm', nivel: 'VIEW' }],
  })
  try {
    await como(browser, leitor, async p => {
      await p.goto('/admin/oportunidades')
      await p.locator(`[data-lead-id="${id}"]`).click()
      const janela = p.locator('dialog[open]')
      await expect(janela.locator('[data-oportunidade-so-leitura]')).toContainText('Só leitura')
      expect(await janela.getByLabel('Origem', { exact: true }).evaluate(el => getComputedStyle(el).appearance)).toBe('none')
      await expect(janela.getByText('Preencha pelo menos um dos campos abaixo')).toHaveCount(0)
      await expect(janela.locator('[data-procedimentos-so-leitura]')).toBeVisible()
      await expect(janela.locator('button.chip-filtro')).toHaveCount(0)
      await expect(janela.locator('input[name="retornar_em"]')).toHaveAttribute('type', 'text')
    })
  } finally {
    await leitor.limpar()
  }
})

test('o filtro "Etapa" do inbox diz o funil de cada etapa e, com o funil escolhido, mostra só as dele', async ({ browser }) => {
  const { data: f2, error } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'Corporal', is_default: false, position: 1 }).select('id').single<{ id: string }>()
  expect(error, 'o segundo funil').toBeNull()
  const { error: e2 } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: f2!.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' })
  expect(e2, 'a etapa do segundo funil').toBeNull()
  try {
    await como(browser, sdr, async p => {
      await p.goto('/admin/inbox')
      await p.getByTitle('Filtrar conversas').click()
      const etapaSel = p.locator('select.filtro-select', { has: p.getByRole('option', { name: 'Todas as etapas', exact: true }) })
      await expect(etapaSel.locator('option', { hasText: 'Vendas · Novo' })).toHaveCount(1)
      await expect(etapaSel.locator('option', { hasText: 'Corporal · Novo' })).toHaveCount(1)

      await p.locator('select.filtro-select', { has: p.getByRole('option', { name: 'Todos os funis', exact: true }) }).selectOption({ label: 'Corporal' })
      const nomes = await etapaSel.locator('option').allTextContents()
      expect(nomes).toEqual(['Todas as etapas', 'Novo'])
    })
  } finally {
    await db().from('crm_stages').delete().eq('funnel_id', f2!.id)
    await db().from('crm_funnels').delete().eq('id', f2!.id)
  }
})
