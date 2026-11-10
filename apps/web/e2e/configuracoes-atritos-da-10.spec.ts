import { test, expect, devices, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * Os atritos de setup, cadastro e importação da 10ª simulação (2026-11-10), da F50:
 * - A4: o botão do Copilot cobria o fim da página no celular.
 * - A6: o procedimento criado antes do estoque ficava sem insumo, e nada lembrava
 *   de ligar depois — a baixa automática nunca acontecia.
 * - A7: a prévia da importação dizia só "20 linhas prontas": sem amostra, sem o
 *   formato do pacote e sem o aviso do pacote sem valor de referência.
 * - A8: no Novo produto os rótulos não estavam ligados aos campos.
 * - A9: a lista de cargos mudava de ordem a cada salvar.
 * - A11: o modal da comissão da profissional não dizia quais procedimentos têm a
 *   regra GERAL, que vence a dela.
 *
 * Numa rede [e2e] própria, com a dona.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
const PIXEL_7 = devices['Pixel 7']

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>, celular = false) {
  const ctx = await browser.newContext({
    storageState: quem.estado,
    ...(celular ? { viewport: { width: 412, height: 839 }, deviceScaleFactor: PIXEL_7.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: PIXEL_7.userAgent } : {}),
  })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cf10${marca}`)
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  // Um insumo no estoque, e o procedimento (o da rede) sem insumo ligado (A6).
  await rede.criarProduto('Gel A6', 5)
  // A11: o procedimento com a comissão GERAL de 40% (vale para todas).
  expect((await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: null, procedure_id: rede.procedureId, type: 'PERCENTAGE', value: 40,
  })).error).toBeNull()
  dona = await criarMembro(`cf10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  if (rede) await db().from('commission_rules').delete().eq('tenant_id', rede.tenantId)
  await dona?.limpar(); await rede?.limpar()
})

test('A6: o catálogo diz o procedimento sem insumo ligado — a baixa automática não acontece nele', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/procedures')
    await expect(p.locator('[data-sem-insumo-ligado]')).toContainText('1 procedimento ativo sem insumo ligado')
    const linha = p.locator('tr').filter({ hasText: `${PREFIXO} Proc cf10${marca}` })
    await expect(linha.locator('[data-chip-sem-insumo]')).toHaveText('Sem insumo ligado')
  })
})

test('A8: no Novo produto, o rótulo é ligado ao campo e alinhado à esquerda', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/estoque')
    await p.getByRole('button', { name: /Novo produto/ }).first().click()
    const janela = p.locator('dialog[open]')
    await expect(janela.getByLabel('Nome *')).toBeVisible()
    await expect(janela.getByLabel('Estoque mínimo')).toBeVisible()
    const alinhamento = await janela.getByText('Nome *', { exact: true }).evaluate(e => getComputedStyle(e).textAlign)
    expect(['left', 'start']).toContain(alinhamento)
  })
})

test('A9: a lista de cargos não muda de ordem quando um cargo é salvo', async ({ browser }) => {
  await como(browser, dona!, async p => {
    const ordem = async () => {
      await p.goto('/admin/settings?tab=permissions')
      await expect(p.locator('[data-cargo]').first()).toBeVisible()
      return p.locator('[data-cargo]').evaluateAll(es => es.map(e => e.getAttribute('data-cargo')))
    }
    // Os quatro modelos (e os dois de sistema) nascem na MESMA transação, com o
    // mesmo created_at: a ordem entre eles era a da tabela, e salvar um (que
    // regrava a linha) a trocava — na Tulipa já estava "Profissional,
    // Recepcionista, Financeiro, Gerente". O nome desempata.
    const { data: cargos } = await db().from('tenant_roles').select('id, label, is_system, created_at').eq('tenant_id', rede!.tenantId)
    const esperada = [...(cargos ?? [])].sort((a, b) =>
      Number(b.is_system) - Number(a.is_system)
      || String(a.created_at).localeCompare(String(b.created_at))
      || String(a.label).localeCompare(String(b.label), 'pt-BR')).map(c => c.id as string)
    expect(await ordem()).toEqual(esperada)
    // Salvar um cargo não muda a ordem.
    expect((await db().from('tenant_roles').update({ inbox_caixas: 'todas' }).eq('id', esperada[esperada.length - 1]!)).error).toBeNull()
    expect(await ordem()).toEqual(esperada)
  })
})

test('A11: a comissão da profissional diz quais procedimentos têm a regra geral, que vence a dela', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/team')
    await p.locator(`[data-comissao="${rede!.professionalId}"]`).click()
    const janela = p.getByRole('dialog', { name: new RegExp('Comissão de') })
    const gerais = janela.locator('[data-gerais-que-vencem]')
    await expect(gerais).toContainText(`${PREFIXO} Proc cf10${marca}`)
    await expect(gerais).toContainText('40%')
  })
})

test('A7: a prévia da importação mostra uma amostra, o formato do pacote e o pacote sem valor', async ({ browser }) => {
  const csv = [
    'Nome;Celular;Pacote',
    `${PREFIXO} Ana A7 ${marca};(48) 99111-0001;"${PREFIXO} Proc cf10${marca}; 8; 3"`,
    `${PREFIXO} Bia A7 ${marca};(48) 99111-0002;`,
  ].join('\r\n')
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=importacoes')
    await p.getByLabel('Arquivo CSV').setInputFiles({ name: `a7-${marca}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') })
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    // O formato do pacote, no passo das colunas.
    await expect(p.locator('[data-formato-do-pacote]')).toContainText('procedimento; total; usadas')
    await p.getByRole('button', { name: 'Continuar', exact: true }).click()
    const previa = p.locator('[data-previa]')
    await expect(previa.locator('[data-amostra-da-importacao]')).toContainText(`${PREFIXO} Ana A7 ${marca}`)
    await expect(previa.locator('[data-amostra-da-importacao]')).toContainText(`${PREFIXO} Bia A7 ${marca}`)
    await expect(previa.locator('[data-pacotes-sem-valor]')).toContainText('1 pacote de antes sem valor de referência')
  })
})

test('A4: no celular, o fim da página fica acima do botão do Copilot', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/procedures')
    const botao = p.locator('.copilot-botao')
    await expect(botao).toBeVisible()
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const fimDoConteudo = await p.locator('main').evaluate(m => {
      const filhos = m.querySelectorAll('*')
      let fim = 0
      for (const f of filhos) { const r = f.getBoundingClientRect(); if (r.height > 0) fim = Math.max(fim, r.bottom) }
      return fim
    })
    const caixa = (await botao.boundingBox())!
    expect(fimDoConteudo, 'o último conteúdo termina antes do botão').toBeLessThanOrEqual(caixa.y)
  }, true)
})
