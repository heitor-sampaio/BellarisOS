import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D6 da 8ª simulação (2026-11-06): a busca de cliente não achava o que existe.
 * (a) A lista de Clientes e o modal Agendar não ignoravam acento — "Zelia" não
 * achava "Zélia" (o Ctrl K achava). (b) A lista só achava o telefone escrito
 * como foi gravado: "85991000034" não achava "(85) 99100-0034". (c) O Ctrl K
 * não achava o número com o 55 do WhatsApp e oferecia "Cadastrar … como
 * cliente" — a ficha em dobro.
 *
 * Agora é UMA regra (a da `busca_universal`): sem acento, todas as palavras, e
 * o telefone por dígitos com o 55 e o nono dígito do celular tolerados — na
 * lista, no modal Agendar (`buscar_clientes`) e no Ctrl K.
 *
 * Numa rede [e2e] própria; as fichas nascem antes de qualquer tela (o cache
 * da lista de clientes).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let zelia = ''
let bruna = ''
// Oito dígitos do número, diferentes em cada rodada.
const n8 = String(Date.now()).slice(-8)
const n8b = String(Date.now() + 37_771).slice(-8)
// A Zélia foi gravada com máscara e o nono dígito: (85) 9NNNN-NNNN.
const FONE_ZELIA = `(85) 9${n8.slice(0, 4)}-${n8.slice(4)}`
// A Bruna, no formato do WhatsApp, SEM o nono dígito: 5585NNNNNNNN.
const FONE_BRUNA = `5585${n8b}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`bc${marca}`)
  const r = await db().from('clients').insert([
    { tenant_id: rede.tenantId, branch_id: rede.branchId, name: `${PREFIXO} Zélia Prado ${marca}`, phone: FONE_ZELIA },
    { tenant_id: rede.tenantId, branch_id: rede.branchId, name: `${PREFIXO} Bruna Lins ${marca}`, phone: FONE_BRUNA },
  ]).select('id, name')
  expect(r.error).toBeNull()
  zelia = r.data!.find(c => (c.name as string).includes('Zélia'))!.id as string
  bruna = r.data!.find(c => (c.name as string).includes('Bruna'))!.id as string
  recepcao = await criarMembro(`bcr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao da busca',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await recepcao?.limpar(); await rede?.limpar()
})

test('D6: a lista de Clientes acha sem acento e pelo telefone digitado de outro jeito', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/clients')
    const busca = p.locator('.clients-master-list input.campo-busca')
    const lista = p.locator('.clients-master-list')
    const ve = async (termo: string, nome: RegExp) => {
      await busca.fill(termo)
      await expect(lista.getByText(nome)).toBeVisible({ timeout: 15_000 })
    }
    await ve(`zelia ${marca}`, /Zélia Prado/)            // sem acento
    await ve(`prado zelia ${marca}`, /Zélia Prado/)      // as palavras em qualquer ordem
    await ve(`859${n8}`, /Zélia Prado/)                  // só dígitos, gravado com máscara
    await ve(`55859${n8}`, /Zélia Prado/)                // com o 55 do WhatsApp
    await ve(`(85) 9${n8.slice(0, 4)}-${n8.slice(4)}`, /Zélia Prado/)
    await ve(`859${n8b}`, /Bruna Lins/)                  // com o nono dígito; gravada sem ele
    await ve(`(85) ${n8b.slice(0, 4)}-${n8b.slice(4)}`, /Bruna Lins/)
  })
})

test('D6: o modal Agendar (buscar_clientes) acha sem acento e pelo telefone com o 55 ou o 9', async ({ browser }) => {
  await como(browser, async p => {
    const achou = async (termo: string, id: string) => {
      const r = await chamarAcao(p, 'actions/appointments.ts', 'buscarClientesParaAgendar', '/admin/agenda', [termo])
      expect(r.status).toBe(200)
      expect(r.texto, `"${termo}" acha a ficha`).toContain(id)
    }
    await achou(`Zelia ${marca}`, zelia)
    await achou(`859${n8}`, zelia)
    await achou(`55859${n8}`, zelia)
    await achou(`859${n8b}`, bruna)
    await achou(`(85) 9${n8b.slice(0, 4)}-${n8b.slice(4)}`, bruna)
  })
})

test('D6: o Ctrl K acha o número com o 55 do WhatsApp e não oferece cadastrar de novo', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/dashboard')
    const campo = p.getByRole('combobox', { name: 'Busca universal' })
    await expect(campo).toBeVisible()
    await campo.fill(`55859${n8}`)
    await expect(p.locator('[data-tipo="cliente"]', { hasText: `Zélia Prado ${marca}` })).toBeVisible({ timeout: 15_000 })
    await expect(p.getByRole('option', { name: /como cliente/ })).toHaveCount(0)
    // A do WhatsApp sem o nono, procurada com ele.
    await campo.fill(`(85) 9${n8b.slice(0, 4)}-${n8b.slice(4)}`)
    await expect(p.locator('[data-tipo="cliente"]', { hasText: `Bruna Lins ${marca}` })).toBeVisible({ timeout: 15_000 })
    await expect(p.getByRole('option', { name: /como cliente/ })).toHaveCount(0)
  })
})
