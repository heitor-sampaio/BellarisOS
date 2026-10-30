import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Decisão do Heitor (2026-10-30): no app da cliente aparece só o arquivo que a
 * clínica ENVIA. Desde f1f2fae toda foto clínica anexada no atendimento ia
 * para `client_documents` e chegava sozinha ao Histórico do portal. Agora
 * cada arquivo tem a marca "enviado à cliente" (`client_documents.enviado_em`),
 * dada pela equipe na aba Documentos da ficha; o portal só lista o marcado.
 * Foto clínica, exame e laudo ficam com a equipe até alguém enviar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let foto = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const NOME_DA_FOTO = `[e2e] Foto antes ${marca}`

async function abrirDocumentosDoPortal(p: Page) {
  await p.goto(`/${slug}/cliente/historico`)
  await p.getByRole('button', { name: /^Documentos/ }).click()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`de${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`dec${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  profissional = await criarMembro(`dep${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  recepcao = await criarMembro(`der${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }],
  })
  const { data, error } = await db().from('client_documents').insert({
    client_id: cliente.clientId, branch_id: rede.branchId, name: NOME_DA_FOTO, category: 'foto_clinica',
    file_path: `${rede.branchId}/${cliente.clientId}/e2e-${marca}.png`, file_name: 'foto.png', mime_type: 'image/png',
  }).select('id').single<{ id: string }>()
  expect(error, 'anexar a foto').toBeNull()
  foto = data!.id
})
test.afterAll(async () => {
  await profissional?.limpar(); await recepcao?.limpar(); await cliente?.limpar(); await rede?.limpar()
})

test.describe.serial('o documento chega ao app só quando a clínica envia', () => {
  test('a foto clínica anexada não aparece no app da cliente', async ({ browser }) => {
    await como(browser, cliente!.estado, async p => {
      await abrirDocumentosDoPortal(p)
      await expect(p.getByText('Nenhum documento disponível.')).toBeVisible()
      await expect(p.getByText(NOME_DA_FOTO)).toHaveCount(0)
    })
  })

  test('sem o prontuário, a recepção não envia a foto clínica (pelo id)', async ({ browser }) => {
    await como(browser, recepcao!.estado, async p => {
      const r = await chamarAcao(p, 'actions/client-documents.ts', 'enviarDocumentoACliente',
        `/${slug}/clients/${cliente!.clientId}`, [foto, true])
      expect(r.texto).toContain('error')
    })
    const linha = (await db().from('client_documents').select('enviado_em').eq('id', foto).single()).data!
    expect(linha.enviado_em).toBeNull()
  })

  test('a profissional envia pela ficha, e a cliente passa a ver', async ({ browser }) => {
    await como(browser, profissional!.estado, async p => {
      await p.goto(`/${slug}/clients/${cliente!.clientId}?aba=documentos`)
      const linhaDoDoc = p.locator(`[data-documento-da-ficha="${foto}"]`)
      await expect(linhaDoDoc.getByText('Só a equipe vê')).toBeVisible()
      await linhaDoDoc.getByRole('button', { name: 'Enviar à cliente' }).click()
      await expect(linhaDoDoc.getByText(/No app da cliente desde/)).toBeVisible()
    })
    const linha = (await db().from('client_documents').select('enviado_em, enviado_por').eq('id', foto).single()).data!
    expect(linha.enviado_em).not.toBeNull()
    expect(linha.enviado_por).toBe(profissional!.userId)

    await como(browser, cliente!.estado, async p => {
      await abrirDocumentosDoPortal(p)
      await expect(p.getByText(NOME_DA_FOTO)).toBeVisible()
    })
  })

  test('"Tirar do app" volta a esconder', async ({ browser }) => {
    await como(browser, profissional!.estado, async p => {
      await p.goto(`/${slug}/clients/${cliente!.clientId}?aba=documentos`)
      const linhaDoDoc = p.locator(`[data-documento-da-ficha="${foto}"]`)
      await linhaDoDoc.getByRole('button', { name: 'Tirar do app' }).click()
      await expect(linhaDoDoc.getByText('Só a equipe vê')).toBeVisible()
    })
    await como(browser, cliente!.estado, async p => {
      await abrirDocumentosDoPortal(p)
      await expect(p.getByText(NOME_DA_FOTO)).toHaveCount(0)
    })
  })
})
