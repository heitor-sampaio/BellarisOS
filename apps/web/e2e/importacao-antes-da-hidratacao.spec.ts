import { test, expect } from '@playwright/test'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A54 da 7ª simulação (2026-11-05): o "Continuar" da importação ficava
 * desligado quando o arquivo era escolhido ANTES de a tela hidratar — o
 * `onChange` do React ainda não existia, e o arquivo ficava no campo sem chegar
 * ao estado. Ao hidratar, a tela lê o arquivo que já está no campo.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let admin: MembroDeTeste | null = null
test.describe.configure({ timeout: 150_000 })

test.beforeAll(async () => {
  rede = await criarOutraRede(`ih${marca}`)
  admin = await criarMembro(`ih${marca}`, { tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [
    { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' },
  ] })
})
test.afterAll(async () => { await admin?.limpar(); await rede?.limpar() })

test('o arquivo escolhido antes da hidratação chega à tela: o "Continuar" liga', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: admin!.estado })
  try {
    const p = await ctx.newPage()
    // Segura o JavaScript da página (só os .js: o CSS segurado seguraria também
    // o HTML que chega depois dele) até o arquivo estar escolhido.
    let soltar: () => void = () => {}
    const travado = new Promise<void>(ok => { soltar = ok })
    await p.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async rota => { await travado; await rota.continue() })
    await p.goto('/admin/settings?tab=importacoes', { waitUntil: 'commit' })
    const campo = p.getByLabel('Arquivo CSV')
    await campo.waitFor({ state: 'attached', timeout: 60_000 })
    await campo.setInputFiles({ name: `antes-${marca}.csv`, mimeType: 'text/csv', buffer: Buffer.from('Nome,Celular\nAna,(48) 99999-0000\n', 'utf-8') })
    soltar()
    await expect(p.getByText(`antes-${marca}.csv`), 'a tela leu o arquivo do campo').toBeVisible({ timeout: 45_000 })
    await expect(p.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled()
  } finally { await ctx.close() }
})
