import { createHash } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { capturarAcao, reenviarAcao } from './apoio/acao'

/**
 * Termos e contratos — fase 1: os modelos da rede
 * (migration 20260930000001_documentos_modelos).
 *
 * Roda numa rede `[e2e]` própria, com um membro que monta modelos (`forms`) e
 * cadastra procedimentos (`procedures`): a configuração da rede real nem é
 * lida. Uma SEGUNDA rede `[e2e]` é o alvo de "um modelo de outra rede não se
 * liga aqui".
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
    if (data?.length) await db().storage.from('modelos-de-documento').remove(data.map(o => `${rede!.tenantId}/${o.name}`))
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
  (await db().from('document_template_versions').select('version, body_markup, file_sha256, file_pages, variables, uses_payment')
    .eq('template_id', templateId).order('version')).data ?? []

async function umPdf(texto: string): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const pagina = pdf.addPage()
  pagina.drawText(texto, { x: 50, y: 700, size: 14, font: await pdf.embedFont(StandardFonts.Helvetica) })
  return Buffer.from(await pdf.save())
}

async function abrirDocumentos(page: Page) {
  await page.goto('/admin/settings?tab=documentos')
  await expect(page.getByRole('heading', { name: 'Termos de consentimento' })).toBeVisible()
}

test.describe.serial('documentos: modelos da rede', () => {
  test('termo pelo editor: variável fora do tipo é recusada, e editar abre uma versão nova', async ({ browser }) => {
    const nome = `${PREFIXO} Termo toxina ${marca}`
    await como(browser, async page => {
      await abrirDocumentos(page)
      await page.getByRole('button', { name: 'Novo termo' }).click()
      await page.getByPlaceholder(/Termo de consentimento — toxina/).fill(nome)

      // O termo também serve ao plano, onde não há "o agendamento".
      const texto = page.locator('textarea')
      await texto.fill('# Termo\n\nEm {{agendamento.data}}, eu {{cliente.nome}} autorizo.')
      await expect(page.getByText(/não serve em termo de consentimento/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Salvar modelo' })).toBeDisabled()

      await texto.fill('# Termo de {{procedimento.nome}}\n\nEu, **{{cliente.nome}}**, CPF {{cliente.cpf}}, autorizo.\n\n[[assinatura]]')
      // A prévia desenha com os dados de exemplo — o mesmo desenho do documento emitido.
      await expect(page.getByText('Termo de Toxina botulínica')).toBeVisible()
      await page.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(page.getByText(nome)).toBeVisible()
      await expect(page.getByText(/Escrito no sistema · versão 1 · nasce ao agendar · bloqueia sem assinatura/)).toBeVisible()

      const m = await modelo(nome)
      expect(m).toMatchObject({ kind: 'TERMO', source: 'EDITOR', moment: 'AGENDAMENTO', enforcement: 'BLOQUEIA', current_version: 1 })
      const v1 = await versoes(m!.id)
      expect(v1).toHaveLength(1)
      expect(v1[0]!.variables).toEqual(['procedimento.nome', 'cliente.nome', 'cliente.cpf'])

      // Mudar só o nome e a exigência NÃO abre versão: o conteúdo é o mesmo.
      await page.getByRole('button', { name: `Editar ${nome}` }).click()
      await page.getByRole('button', { name: 'Só avisa' }).click()
      await page.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(page.getByText(/versão 1 · nasce ao agendar · só avisa/)).toBeVisible()
      expect(await versoes(m!.id)).toHaveLength(1)

      // Mudar o TEXTO abre a v2, e a v1 continua como estava.
      await page.getByRole('button', { name: `Editar ${nome}` }).click()
      await page.locator('textarea').fill('# Termo atualizado\n\nEu, {{cliente.nome}}, autorizo.')
      await expect(page.getByText('Salvar abre a versão 2.', { exact: false })).toBeVisible()
      await page.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(page.getByText(/versão 2/)).toBeVisible()
    })
    const m = await modelo(nome)
    const vs = await versoes(m!.id)
    expect(vs.map(v => v.version)).toEqual([1, 2])
    expect(vs[0]!.body_markup).toContain('CPF {{cliente.cpf}}')
    expect(vs[1]!.body_markup).toContain('Termo atualizado')
    // A versão é retrato: o banco recusa mudá-la.
    const { error } = await db().from('document_template_versions').update({ body_markup: 'mexido' })
      .eq('template_id', m!.id).eq('version', 1)
    expect(error?.message).toMatch(/não se altera/)
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
    const texto = '# Contrato\n\n{{procedimentos.lista}}\n\nTotal {{plano.total}}, pago em {{pagamento.forma}}.'
    await como(browser, async page => {
      for (const n of ['A', 'B']) {
        await abrirDocumentos(page)
        await page.getByRole('button', { name: 'Novo contrato de plano' }).click()
        await page.getByPlaceholder(/Termo de consentimento — toxina/).fill(`${PREFIXO} Contrato de plano ${n} ${marca}`)
        await page.locator('textarea').fill(texto)
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
