import { createHash } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { capturarAcao, reenviarAcao } from './apoio/acao'
import { chamarAcao } from './apoio/acao-direta'
import QRCode from 'qrcode'

/**
 * Termos e contratos — fase 1: os modelos da rede
 * (migration 20260930000001_documentos_modelos).
 *
 * Roda numa rede `[e2e]` própria, com um membro que monta modelos (`forms`) e
 * cadastra procedimentos (`procedures`): a configuração da rede real nem é
 * lida. Uma SEGUNDA rede `[e2e]` é o alvo de "um modelo de outra rede não se
 * liga aqui".
 *
 * O editor é o rico (Tiptap, 2026-09-30): o texto se escreve digitando e pela
 * barra, e o que vai para o banco é o JSON do editor (`body_doc`), conferido
 * pelo conversor no servidor.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let alheia: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let termoAlheio: string | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`dm${marca}`)
  alheia = await criarOutraRede(`dma${marca}`)
  gestor = await criarMembro(`dmg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor documentos',
    permissoes: [{ modulo: 'forms', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' }],
  })
  // O termo da OUTRA rede, direto pela função — alvo dos testes de fronteira.
  const { data, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: alheia.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo alheio ${marca}`, p_tipo: 'TERMO',
    p_origem: 'EDITOR', p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: 'Termo de outra rede',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null,
    p_arquivo_paginas: null, p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error, 'criar o termo da outra rede').toBeNull()
  termoAlheio = (data as { id: string }).id
})

test.afterAll(async () => {
  // Os modelos PRIMEIRO: o gestor os criou pela tela (`created_by`), e o
  // membro não sai enquanto eles apontarem para ele — nem a rede, presa nele.
  if (rede) {
    await db().from('procedures').update({ consent_template_id: null, contract_template_id: null }).eq('tenant_id', rede.tenantId)
    await db().from('document_template_versions').delete().eq('tenant_id', rede.tenantId)
    await db().from('document_templates').delete().eq('tenant_id', rede.tenantId)
  }
  await gestor?.limpar()
  await rede?.limpar()
  await alheia?.limpar()
  // O PDF enviado mora no bucket pelo hash, dentro da pasta da rede.
  if (rede) {
    const { data } = await db().storage.from('modelos-de-documento').list(rede.tenantId)
    const arquivos = (data ?? []).filter(o => o.id).map(o => `${rede!.tenantId}/${o.name}`)
    const { data: imagens } = await db().storage.from('modelos-de-documento').list(`${rede.tenantId}/imagens`)
    arquivos.push(...(imagens ?? []).map(o => `${rede!.tenantId}/imagens/${o.name}`))
    if (arquivos.length) await db().storage.from('modelos-de-documento').remove(arquivos)
  }
})

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const modelo = async (nome: string) =>
  (await db().from('document_templates').select('id, kind, source, moment, enforcement, current_version, is_active')
    .eq('tenant_id', rede!.tenantId).eq('name', nome).maybeSingle()).data
const versoes = async (templateId: string) =>
  (await db().from('document_template_versions').select('version, body_markup, body_doc, file_sha256, file_pages, variables, uses_payment')
    .eq('template_id', templateId).order('version')).data ?? []

async function umPdf(texto: string): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const pagina = pdf.addPage()
  pagina.drawText(texto, { x: 50, y: 700, size: 14, font: await pdf.embedFont(StandardFonts.Helvetica) })
  return Buffer.from(await pdf.save())
}

const corpo = (page: Page) => page.getByLabel('Corpo do documento')
async function limparCorpo(page: Page) {
  await corpo(page).click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
}
const variavel = (page: Page, nome: string) => page.getByLabel('Inserir variável').selectOption(nome)

async function abrirDocumentos(page: Page) {
  await page.goto('/admin/settings?tab=documentos')
  await expect(page.getByRole('heading', { name: 'Termos de consentimento' })).toBeVisible()
}

test.describe.serial('documentos: modelos da rede', () => {
  test('termo pelo editor rico: formata, insere variável, tabela, imagem e cabeçalho; editar abre versão nova', async ({ browser }) => {
    const nome = `${PREFIXO} Termo toxina ${marca}`
    await como(browser, async page => {
      await abrirDocumentos(page)
      await page.getByRole('button', { name: 'Novo termo' }).click()
      await page.getByPlaceholder(/Termo de consentimento — toxina/).fill(nome)
      await limparCorpo(page)

      await page.getByLabel('Estilo do parágrafo').selectOption('h1')
      await page.keyboard.type('Termo de ')
      await variavel(page, 'procedimento.nome')
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await page.getByLabel('Estilo do parágrafo').selectOption('p')
      await page.keyboard.type('Eu, ')
      await page.getByRole('button', { name: 'Negrito' }).click()
      await variavel(page, 'cliente.nome')
      await page.getByRole('button', { name: 'Negrito' }).click()
      await page.keyboard.type(', CPF ')
      await variavel(page, 'cliente.cpf')
      await page.keyboard.type(', autorizo.')
      // Uma parte em outra fonte: seleciona a frase e troca.
      await page.keyboard.press('Shift+Home')
      // O ProseMirror lê a seleção do teclado no `selectionchange`, que é
      // assíncrono: escolher a fonte no mesmo instante pegaria a seleção velha.
      // (Uma pessoa leva mais que isso entre selecionar e ir à barra.)
      await page.waitForTimeout(150)
      await page.getByLabel('Fonte', { exact: true }).selectOption('tinos')
      await expect(corpo(page).locator('span[style*="doc-tinos"]')).toBeVisible()
      // Sai da seleção clicando no parágrafo vazio do fim (o editor sempre
      // mantém um): End + Enter sobre uma seleção com chips substituiria a linha.
      await corpo(page).locator('p').last().click()

      await page.getByRole('button', { name: 'Inserir tabela' }).click()
      await page.keyboard.type('Sessão')
      await page.keyboard.press('Tab')
      await page.keyboard.type('Descrição')
      await corpo(page).locator('p').last().click()
      await page.getByLabel('Imagem do documento').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await QRCode.toBuffer('logo', { width: 120, margin: 1 }) })
      await expect(corpo(page).locator('.doc-imagem img')).toBeVisible()
      await page.getByRole('button', { name: 'Lugar da assinatura' }).click()

      await page.getByRole('button', { name: 'Cabeçalho' }).click()
      await page.getByLabel('Cabeçalho do documento').click()
      await page.keyboard.type('Clínica Exemplo')
      await page.getByRole('button', { name: 'Corpo' }).click()

      // A prévia é o documento de verdade, com os dados de exemplo.
      await page.getByRole('button', { name: 'Prévia com dados de exemplo' }).click()
      const previa = page.locator('[data-previa]')
      await expect(previa.getByText('Termo de Toxina botulínica')).toBeVisible()
      await expect(previa.getByText('Clínica Exemplo')).toBeVisible()
      await page.getByRole('button', { name: 'Prévia com dados de exemplo' }).click()

      await page.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(page.getByText(nome)).toBeVisible()
      await expect(page.getByText(/Escrito no sistema · versão 1 · nasce ao agendar · bloqueia sem assinatura/)).toBeVisible()

      const m = await modelo(nome)
      expect(m).toMatchObject({ kind: 'TERMO', source: 'EDITOR', moment: 'AGENDAMENTO', enforcement: 'BLOQUEIA', current_version: 1 })
      const [v1] = await versoes(m!.id)
      expect(v1!.body_markup).toBeNull()
      expect(v1!.variables).toEqual(['procedimento.nome', 'cliente.nome', 'cliente.cpf'])
      const json = JSON.stringify(v1!.body_doc)
      expect(json).toContain('doc-tinos')
      expect(json).toContain('"type":"table"')
      expect(json).toMatch(new RegExp(`"caminho":"${rede!.tenantId}/imagens/[0-9a-f]{64}\\.png"`))
      expect(json).toContain('Clínica Exemplo')

      // Mudar só a exigência NÃO abre versão: o conteúdo é o mesmo.
      await page.getByRole('button', { name: `Editar ${nome}` }).click()
      await expect(corpo(page)).toBeVisible()
      await page.getByRole('button', { name: 'Só avisa' }).click()
      await page.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(page.getByText(/versão 1 · nasce ao agendar · só avisa/)).toBeVisible()
      expect(await versoes(m!.id)).toHaveLength(1)

      // Mudar o TEXTO abre a v2, e a v1 continua como estava.
      await page.getByRole('button', { name: `Editar ${nome}` }).click()
      await corpo(page).locator('h1').click()
      await page.keyboard.press('End')
      await page.keyboard.type(' — atualizado')
      await expect(page.getByText('Salvar abre a versão 2.', { exact: false })).toBeVisible()
      await page.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(page.getByText(/versão 2/)).toBeVisible()
    })
    const m = await modelo(nome)
    const vs = await versoes(m!.id)
    expect(vs.map(v => v.version)).toEqual([1, 2])
    expect(JSON.stringify(vs[0]!.body_doc)).not.toContain('atualizado')
    expect(JSON.stringify(vs[1]!.body_doc)).toContain('atualizado')
    // A versão é retrato: o banco recusa mudá-la.
    const { error } = await db().from('document_template_versions').update({ body_doc: { corpo: { type: 'doc' } } })
      .eq('template_id', m!.id).eq('version', 1)
    expect(error?.message).toMatch(/não se altera/)
  })

  test('o servidor confere o JSON do editor: variável fora do tipo, nó estranho e imagem de outra rede', async ({ browser }) => {
    const doc = (...content: unknown[]) => ({ corpo: { type: 'doc', content } })
    const par = (...content: unknown[]) => ({ type: 'paragraph', content })
    const salvar = (page: Page, documento: unknown) => chamarAcao(page, 'actions/modelos-de-documento.ts', 'salvarModeloDoEditor', '/admin/settings?tab=documentos', [{
      id: null, nome: `${PREFIXO} Recusado ${marca}`, tipo: 'TERMO', momento: 'AGENDAMENTO', exigencia: 'AVISA', documento,
    }])
    const sha = 'b'.repeat(64)
    await como(browser, async page => {
      // O termo também serve ao plano, onde não há "o agendamento".
      expect((await salvar(page, doc(par({ type: 'variavel', attrs: { nome: 'agendamento.data' } })))).texto).toMatch(/não serve em termo/)
      expect((await salvar(page, doc({ type: 'codeBlock', content: [{ type: 'text', text: 'x' }] }))).texto).toContain('não é aceito')
      expect((await salvar(page, doc({ type: 'imagemDoDocumento', attrs: { caminho: `${alheia!.tenantId}/imagens/${sha}.png`, sha256: sha, largura: 100, altura: 100 } }))).texto)
        .toContain('não é desta rede')
      // Controle: o mesmo pedido, válido, grava.
      await salvar(page, doc(par({ type: 'text', text: 'ok' })))
    })
    expect(await modelo(`${PREFIXO} Recusado ${marca}`)).toMatchObject({ current_version: 1 })
    const { data: v } = await db().from('document_template_versions').select('body_doc').eq('tenant_id', rede!.tenantId)
    expect(JSON.stringify(v)).not.toContain('codeBlock')
  })

  test('contrato em PDF: o que não é PDF é recusado, e o enviado guarda hash e páginas', async ({ browser }) => {
    const nome = `${PREFIXO} Contrato PDF ${marca}`
    const pdf = await umPdf(`Contrato ${marca}`)
    await como(browser, async page => {
      await abrirDocumentos(page)
      await page.getByRole('button', { name: 'Novo contrato', exact: true }).click()
      await page.getByRole('button', { name: 'Enviar PDF' }).click()
      await page.getByPlaceholder(/Termo de consentimento — toxina/).fill(nome)

      // Um .docx renomeado para .pdf: o cabeçalho denuncia.
      await page.getByLabel('Arquivo PDF do modelo').setInputFiles({ name: 'contrato.pdf', mimeType: 'application/pdf', buffer: Buffer.from('PK\u0003\u0004 não sou pdf') })
      await page.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(page.getByText('O arquivo não é um PDF.')).toBeVisible()

      await page.getByLabel('Arquivo PDF do modelo').setInputFiles({ name: 'contrato.pdf', mimeType: 'application/pdf', buffer: pdf })
      await page.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(page.getByText(nome)).toBeVisible()
      await expect(page.getByText(/PDF enviado · versão 1/)).toBeVisible()
    })
    const m = await modelo(nome)
    expect(m).toMatchObject({ kind: 'CONTRATO', source: 'ARQUIVO' })
    const [v] = await versoes(m!.id)
    expect(v).toMatchObject({ file_pages: 1, file_sha256: createHash('sha256').update(pdf).digest('hex') })
  })

  test('contrato de plano: um só ativo por rede', async ({ browser }) => {
    await como(browser, async page => {
      for (const n of ['A', 'B']) {
        await abrirDocumentos(page)
        await page.getByRole('button', { name: 'Novo contrato de plano' }).click()
        await page.getByPlaceholder(/Termo de consentimento — toxina/).fill(`${PREFIXO} Contrato de plano ${n} ${marca}`)
        await limparCorpo(page)
        await page.keyboard.type('Contrato: ')
        await variavel(page, 'procedimentos.lista')
        await page.keyboard.type(' Total ')
        await variavel(page, 'plano.total')
        await page.keyboard.type(', pago em ')
        await variavel(page, 'pagamento.forma')
        await page.getByRole('button', { name: 'Salvar modelo' }).click()
        if (n === 'A') await expect(page.getByText(`${PREFIXO} Contrato de plano A ${marca}`)).toBeVisible()
        else await expect(page.getByText(/já tem um contrato de plano ativo/)).toBeVisible()
      }
    })
    const a = await modelo(`${PREFIXO} Contrato de plano A ${marca}`)
    expect(a).toMatchObject({ kind: 'CONTRATO_PLANO', moment: null, is_active: true })
    expect((await versoes(a!.id))[0]).toMatchObject({ uses_payment: true })
    expect(await modelo(`${PREFIXO} Contrato de plano B ${marca}`)).toBeNull()
  })

  test('o procedimento liga um termo e um contrato; o de outra rede é recusado', async ({ browser }) => {
    const termo = await modelo(`${PREFIXO} Termo toxina ${marca}`)
    const contrato = await modelo(`${PREFIXO} Contrato PDF ${marca}`)
    await como(browser, async page => {
      await page.goto('/admin/procedures')
      const linha = page.locator('tr', { hasText: `${PREFIXO} Proc dm${marca}` })
      await linha.getByRole('button', { name: 'Editar' }).click()
      const dialogo = page.locator('dialog[open]')
      await dialogo.locator('select[name="consent_template_id"]').selectOption(termo!.id)
      await expect(dialogo.getByText('Nasce ao agendar · só avisa se faltar')).toBeVisible()
      await dialogo.locator('select[name="contract_template_id"]').selectOption(contrato!.id)

      // O ataque: a mesma chamada com o termo de OUTRA rede no lugar.
      const chamada = capturarAcao(page, corpo => corpo.includes(termo!.id))
      await dialogo.getByRole('button', { name: 'Salvar alterações' }).click()
      await expect(dialogo).toBeHidden()
      const r = await reenviarAcao(page, await chamada, [[termo!.id, termoAlheio!]])
      expect(await r.text()).toContain('Termo de consentimento não encontrado')
    })
    const { data: p } = await db().from('procedures').select('consent_template_id, contract_template_id')
      .eq('id', rede!.procedureId).single()
    expect(p).toEqual({ consent_template_id: termo!.id, contract_template_id: contrato!.id })

    // E o banco recusa por conta própria: o tipo errado no campo, e a outra rede.
    const tipoErrado = await db().from('procedures').update({ consent_template_id: contrato!.id }).eq('id', rede!.procedureId)
    expect(tipoErrado.error?.message).toMatch(/tem de ser um modelo de termo/)
    const outraRede = await db().from('procedures').update({ consent_template_id: termoAlheio }).eq('id', rede!.procedureId)
    expect(outraRede.error?.code).toBe('23503')
  })

  test('RLS: o membro lê os modelos da própria rede e nenhum da outra', async () => {
    const sessao = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${gestor!.accessToken}` } },
    })
    const proprios = await sessao.from('document_templates').select('id').eq('tenant_id', rede!.tenantId)
    expect(proprios.error).toBeNull()
    expect(proprios.data!.length, 'o controle: a própria rede aparece').toBeGreaterThan(0)
    const alheios = await sessao.from('document_templates').select('id').eq('id', termoAlheio!)
    expect(alheios.data ?? []).toEqual([])
    const versoesAlheias = await sessao.from('document_template_versions').select('id').eq('template_id', termoAlheio!)
    expect(versoesAlheias.data ?? []).toEqual([])
    // E escrever pela sessão não existe: nenhuma política de escrita.
    const escrita = await sessao.from('document_templates').update({ name: 'invadido' }).eq('tenant_id', rede!.tenantId).select('id')
    expect(escrita.data ?? []).toEqual([])
    const rpc = await sessao.rpc('documento_modelo_salvar', {
      p_tenant: alheia!.tenantId, p_modelo: null, p_nome: 'invasor', p_tipo: 'TERMO', p_origem: 'EDITOR',
      p_momento: 'AGENDAMENTO', p_exigencia: 'AVISA', p_texto: 'x', p_arquivo_path: null, p_arquivo_sha256: null,
      p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null, p_variaveis: [], p_usa_pagamento: false, p_ator: null,
    })
    expect(rpc.error, 'a função é só do servidor').not.toBeNull()
  })
})
