import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * C77 (F65): a ficha da cliente montava TODAS as abas a cada abertura — a
 * linha do tempo inteira, os links assinados dos documentos, as negociações,
 * os lotes do prontuário —, e o anexar esperava a ficha inteira se refazer.
 * Agora o servidor monta o que a aba ABERTA mostra (a Visão geral sempre,
 * porque o topo da ficha é dela); o resto vem quando a aba é aberta. Tudo o
 * que cada aba mostra continua lá — nas duas fichas (a da unidade e a da rede).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let cliente = ''
let gestor: MembroDeTeste | null = null
const CAMINHO = () => `${rede!.branchId}/${cliente}/c77-${marca}.txt`

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
/** O HTML que o servidor manda (com os dados da página), sem o navegador montar nada. */
const html = async (p: Page, rota: string) => {
  const r = await p.request.get(rota)
  expect(r.status(), rota).toBe(200)
  return r.text()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`c77${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Ficha por aba')
  const up = await db().storage.from('client-documents').upload(CAMINHO(), Buffer.from('c77'), { contentType: 'text/plain' })
  expect(up.error, 'o arquivo').toBeNull()
  expect((await db().from('client_documents').insert({
    client_id: cliente, branch_id: rede.branchId, name: `Contrato c77 ${marca}`, category: 'outro',
    file_path: CAMINHO(), file_name: 'c77.txt', file_size: 3, mime_type: 'text/plain',
  })).error).toBeNull()
  gestor = await criarMembro(`c77g${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Gerente',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  if (cliente) {
    await db().from('client_documents').delete().eq('client_id', cliente)
    await db().storage.from('client-documents').remove([CAMINHO()])
  }
  await gestor?.limpar(); await rede?.limpar()
})

for (const portal of ['unidade', 'rede'] as const) {
  test(`C77 (${portal}): a Visão geral não monta a linha do tempo nem assina os documentos; cada aba monta o seu`, async ({ browser }) => {
    const base = portal === 'unidade' ? `/${slug}/clients/${cliente}` : `/admin/clients/${cliente}`
    await como(browser, gestor!, async p => {
      const visao = await html(p, base)
      expect(visao, 'a linha do tempo não vem na Visão geral').not.toContain('Cliente cadastrado')
      expect(visao, 'o link assinado do documento não vem na Visão geral').not.toMatch(/c77-[a-z0-9]+\.txt\?token=/)

      const historico = await html(p, `${base}?aba=historico`)
      expect(historico, 'a aba Histórico tem a linha do tempo').toContain('Cliente cadastrado')

      const documentos = await html(p, `${base}?aba=documentos`)
      expect(documentos, 'a aba Documentos tem o link assinado').toMatch(/c77-[a-z0-9]+\.txt\?token=/)

      // E o que o navegador mostra continua: o documento na aba, baixável.
      await p.goto(`${base}?aba=documentos`)
      await expect(p.getByText(`Contrato c77 ${marca}`)).toBeVisible()
      expect(await p.getByTitle('Baixar').first().getAttribute('href')).toMatch(/token=/)
      await p.goto(`${base}?aba=historico`)
      await expect(p.getByText('Cliente cadastrado')).toBeVisible()
    })
  })
}
