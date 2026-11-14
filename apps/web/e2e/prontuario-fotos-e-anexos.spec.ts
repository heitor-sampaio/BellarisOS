import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Bloco Prontuário do plano de adaptação (a revisão do Heitor, 2026-11-13:
 * "pode trazer as fotos pro prontuário").
 *
 * PR1a — a foto do atendimento aparece no atendimento DELA, na aba Prontuário
 * da ficha: a miniatura que abre grande, o momento (antes/durante/depois),
 * "Enviar à cliente"/"Tirar do app". Saiu o "2 fotos em Documentos → Foto
 * clínica", e o cartão vazio da tela do atendimento diz que a foto fica no
 * prontuário.
 *
 * PR1b — "Anexos clínicos" na aba Prontuário: o exame, o laudo, a receita, a
 * foto e o termo anexados sem atendimento — anexar, ver, apagar (só marca) e
 * enviar à cliente. A aba Documentos fica com o anexo comum (RG, comprovante,
 * "outro"), e o aviso dos anexos clínicos que o cargo não abre vai junto para
 * o Prontuário.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const BUCKET = 'client-documents'
// PNG de 1×1.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let soOsMeus: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let atendimento = ''
let semFoto = ''
let foto = ''
let exame = ''
let comum = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function anexo(campos: { category: string; name: string; appointment_id?: string | null; momento?: string | null }): Promise<string> {
  const caminho = `${rede!.branchId}/${cliente}/${Date.now()}_${Math.random().toString(36).slice(2)}.png`
  const up = await db().storage.from(BUCKET).upload(caminho, PNG, { contentType: 'image/png' })
  expect(up.error).toBeNull()
  const { data, error } = await db().from('client_documents').insert({
    client_id: cliente, branch_id: rede!.branchId, file_path: caminho, file_name: 'arquivo.png', file_size: PNG.length,
    mime_type: 'image/png', ...campos,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pfa${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`pfad${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  // O prontuário "só os meus", de quem NÃO atende a cliente: o recorte.
  soOsMeus = await criarMembro(`pfao${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só os meus',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'VIEW', escopo: 'OWN' }],
  })
  cliente = await rede.criarCliente('Mariana')
  const base = {
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0,
  }
  const { data: ags, error } = await db().from('appointments').insert([
    { ...base, scheduled_at: new Date(Date.now() - 5 * 3600_000).toISOString(), completed_at: new Date(Date.now() - 4 * 3600_000).toISOString() },
    { ...base, scheduled_at: new Date(Date.now() - 50 * 3600_000).toISOString(), completed_at: new Date(Date.now() - 49 * 3600_000).toISOString() },
  ]).select('id, scheduled_at').order('scheduled_at', { ascending: false })
  expect(error).toBeNull()
  atendimento = ags![0]!.id as string
  semFoto = ags![1]!.id as string
  const { data: pr } = await db().from('medical_records').insert({ client_id: cliente }).select('id').single<{ id: string }>()
  expect((await db().from('medical_record_entries').insert([
    { medical_record_id: pr!.id, appointment_id: atendimento, professional_id: rede.professionalId, notes: `Evolução ${marca}` },
    { medical_record_id: pr!.id, appointment_id: semFoto, professional_id: rede.professionalId, notes: `Outra evolução ${marca}` },
  ])).error).toBeNull()
  foto = await anexo({ category: 'foto_clinica', name: `Foto antes ${marca}`, appointment_id: atendimento, momento: 'ANTES' })
  exame = await anexo({ category: 'exame', name: `Exame de sangue ${marca}` })
  comum = await anexo({ category: 'outro', name: `Comprovante ${marca}` })
})
test.afterAll(async () => { await dona?.limpar(); await soOsMeus?.limpar(); await rede?.limpar() })

test.describe.serial('PR1: as fotos e os anexos clínicos moram no Prontuário', () => {
  test('PR1a: a foto aparece no atendimento dela, com o momento, abre grande e vai ao app', async ({ browser }) => {
    await como(dona!, browser, async p => {
      await p.goto(`/admin/clients/${cliente}?aba=fichas`)
      const cartao = p.locator(`[data-foto-do-atendimento="${foto}"]`)
      await expect(cartao, 'a foto está no atendimento, na aba Prontuário').toBeVisible()
      await expect(p.locator(`[data-registro-do-atendimento="${atendimento}"] [data-foto-do-atendimento="${foto}"]`)).toBeVisible()
      await expect(cartao.locator('[data-momento-da-foto]')).toHaveText('Antes')
      await expect(cartao.locator('[data-titulo-da-foto]')).toHaveText(`Foto antes ${marca}`)
      await expect(p.getByText(/Documentos → Foto clínica/), 'saiu o "em Documentos → Foto clínica"').toHaveCount(0)

      await cartao.getByRole('button', { name: /^Ver / }).click()
      const janela = p.getByRole('dialog')
      await expect(janela.getByRole('img')).toBeVisible()
      await janela.getByRole('button', { name: 'Fechar' }).click()

      await cartao.getByRole('button', { name: 'Enviar à cliente' }).click()
      await expect.poll(async () => (await db().from('client_documents').select('enviado_em').eq('id', foto).single()).data?.enviado_em).not.toBeNull()
      await expect(cartao.getByText('No app da cliente')).toBeVisible()
      await cartao.getByRole('button', { name: 'Tirar do app' }).click()
      await expect.poll(async () => (await db().from('client_documents').select('enviado_em').eq('id', foto).single()).data?.enviado_em).toBeNull()
    })
  })

  test('PR1b: o exame sem atendimento está em "Anexos clínicos"; a aba Documentos fica com o comum', async ({ browser }) => {
    await como(dona!, browser, async p => {
      await p.goto(`/admin/clients/${cliente}?aba=fichas`)
      const anexos = p.locator('[data-anexos-clinicos]')
      await expect(anexos.locator(`[data-anexo-clinico="${exame}"]`)).toBeVisible()
      await expect(anexos.getByText(`Exame de sangue ${marca}`)).toBeVisible()
      await expect(anexos.locator(`[data-anexo-clinico="${foto}"]`), 'a foto do atendimento fica no atendimento').toHaveCount(0)
      await expect(anexos.getByText(`Comprovante ${marca}`), 'o comum não é prontuário').toHaveCount(0)

      await p.goto(`/admin/clients/${cliente}?aba=documentos`)
      await expect(p.locator(`[data-documento-da-ficha="${comum}"]`)).toBeVisible()
      await expect(p.locator(`[data-documento-da-ficha="${exame}"]`), 'o exame saiu da aba Documentos').toHaveCount(0)
      await expect(p.locator(`[data-documento-da-ficha="${foto}"]`), 'a foto saiu da aba Documentos').toHaveCount(0)
      await p.getByRole('button', { name: 'Adicionar documento' }).click()
      const opcoes = await p.locator('select[name="category"] option').allTextContents()
      expect(opcoes, 'o formulário dos Documentos só oferece o comum').not.toContain('Exame')
      expect(opcoes).not.toContain('Foto clínica')
      expect(opcoes).toContain('Outro')
    })
  })

  test('PR1b: anexar o laudo pelo Prontuário, enviar à cliente e apagar (só marca)', async ({ browser }) => {
    const nome = `Laudo dermatológico ${marca}`
    await como(dona!, browser, async p => {
      p.on('dialog', d => d.accept())
      await p.goto(`/admin/clients/${cliente}?aba=fichas`)
      const anexos = p.locator('[data-anexos-clinicos]')
      await anexos.getByRole('button', { name: 'Anexar' }).click()
      const opcoes = await anexos.locator('select[name="category"] option').allTextContents()
      expect(opcoes, 'o Prontuário só oferece o clínico').not.toContain('Outro')
      await anexos.locator('select[name="category"]').selectOption('laudo')
      await anexos.locator('input[name="name"]').fill(nome)
      await anexos.locator('input[name="file"]').setInputFiles({ name: 'laudo.png', mimeType: 'image/png', buffer: PNG })
      await anexos.getByRole('button', { name: 'Anexar documento' }).click()
      await expect.poll(async () => (await db().from('client_documents').select('id').eq('client_id', cliente).eq('name', nome)).data?.length).toBe(1)
      const { data: laudo } = await db().from('client_documents').select('id, category, appointment_id').eq('name', nome).single<{ id: string; category: string; appointment_id: string | null }>()
      expect(laudo).toMatchObject({ category: 'laudo', appointment_id: null })
      const linha = anexos.locator(`[data-anexo-clinico="${laudo!.id}"]`)
      await expect(linha).toBeVisible()

      await linha.getByRole('button', { name: 'Enviar à cliente' }).click()
      await expect.poll(async () => (await db().from('client_documents').select('enviado_em').eq('id', laudo!.id).single()).data?.enviado_em).not.toBeNull()

      await linha.getByTitle('Excluir').click()
      await expect.poll(async () => (await db().from('client_documents').select('apagado_em').eq('id', laudo!.id).single()).data?.apagado_em).not.toBeNull()
      await expect(linha).toHaveCount(0)
      // Só marca: a linha fica, com quem apagou.
      const { data: marcado } = await db().from('client_documents').select('apagado_por_nome').eq('id', laudo!.id).single<{ apagado_por_nome: string | null }>()
      expect(marcado?.apagado_por_nome).toBeTruthy()
    })
  })

  test('PR1b: o recorte se diz no Prontuário (o "só os meus" de quem não atende), não nos Documentos', async ({ browser }) => {
    const { count } = await db().from('client_documents').select('id', { count: 'exact', head: true })
      .eq('client_id', cliente).is('apagado_em', null).in('category', ['termo_consentimento', 'exame', 'laudo', 'foto_clinica', 'receita'])
    await como(soOsMeus!, browser, async p => {
      await p.goto(`/admin/clients/${cliente}?aba=fichas`)
      const fora = p.locator('[data-anexos-clinicos-fora]')
      await expect(fora).toBeVisible()
      await expect(fora).toContainText(`Há ${count} anexos clínicos desta cliente`)
      await expect(p.getByText(`Exame de sangue ${marca}`), 'nada do conteúdo').toHaveCount(0)
      await p.goto(`/admin/clients/${cliente}?aba=documentos`)
      await expect(p.locator('[data-anexos-clinicos-fora]'), 'o aviso foi junto para o Prontuário').toHaveCount(0)
    })
  })

  test('PR1a: na tela do atendimento, o cartão vazio diz que a foto fica no prontuário, e o momento se grava', async ({ browser }) => {
    await como(dona!, browser, async p => {
      await p.goto(`/${slug}/agenda/${semFoto}`)
      const fotos = p.locator('[data-fotos-do-atendimento]')
      await expect(fotos.getByText('Nenhuma foto neste atendimento. Ela fica no prontuário da cliente, no registro deste atendimento.')).toBeVisible()
      await fotos.getByRole('button', { name: 'Anexar foto' }).click()
      await fotos.getByRole('group', { name: 'Momento da foto' }).getByText('Durante', { exact: true }).click()
      await fotos.locator('input[name="file"]').setInputFiles({ name: 'durante.png', mimeType: 'image/png', buffer: PNG })
      await fotos.getByRole('button', { name: 'Anexar foto' }).last().click()
      await expect.poll(async () => (await db().from('client_documents').select('momento').eq('appointment_id', semFoto)).data?.map(d => d.momento)).toEqual(['DURANTE'])
      await expect(fotos.locator('[data-momento-da-foto]')).toHaveText('Durante')
    })
  })
})

