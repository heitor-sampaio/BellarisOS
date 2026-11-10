import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * D1 da 11ª simulação (2026-11-10): o lead criado em SEQUÊNCIA saía sem
 * responsável. A Tatiane criou 6 leads no mesmo quadro, e 4 ficaram com
 * `owner_id` nulo ("Sem responsável" no funil). Da 2ª abertura do "Novo lead"
 * em diante a lista de responsáveis já estava em memória: o select aparecia na
 * hora com "Sem responsável" e só voltava para ela quando o servidor
 * respondia — quem gravava antes mandava `owner_id=''`, e a action trocava o
 * dono de quem criou para ninguém.
 *
 * Pelo princípio 3: o lead novo abre já com quem cria, o select não mostra um
 * valor diferente do que a tela vai mandar, e a action não troca o dono para
 * ninguém com o campo vazio de uma tela que não o mostrou.
 * Numa rede [e2e] própria.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let gestora: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const donoDe = async (n: string) => {
  const { data, error } = await db().from('leads').select('owner_id')
    .eq('tenant_id', rede.tenantId).eq('name', nome(n)).maybeSingle<{ owner_id: string | null }>()
  expect(error).toBeNull()
  return data ? data.owner_id : 'ainda não gravado'
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cr11${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: f } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'Vendas', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  expect((await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: f!.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' })).error).toBeNull()
  gestora = await criarMembro(`cr11g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Comercial',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  await gestora?.limpar()
  await rede?.limpar()
})

test('D1: três leads criados em sequência no mesmo modal nascem com quem criou como responsável', async ({ browser }) => {
  await como(browser, gestora, async p => {
    await p.goto('/admin/oportunidades')

    async function criar(rotulo: string, comAtraso: boolean) {
      // O "Novo lead" pede a lista de responsáveis ao abrir (uma action sem
      // argumento, corpo "[]"). Na produção ela demorou; aqui ela demora de
      // propósito, e o lead é gravado antes de ela chegar.
      if (comAtraso) {
        await p.route('**/admin/oportunidades**', async route => {
          const r = route.request()
          if (r.method() === 'POST' && r.headers()['next-action'] && r.postData() === '[]') {
            await new Promise(res => setTimeout(res, 8_000))
          }
          await route.continue().catch(() => {})
        })
      }
      await p.getByRole('button', { name: 'Novo lead' }).click()
      const janela = p.locator('dialog[open]')
      await janela.getByLabel('Nome *').fill(nome(rotulo))
      await janela.getByLabel('E-mail').fill(`${rotulo.toLowerCase().replace(/ /g, '.')}.${marca}@bellaris.invalid`)
      if (comAtraso) {
        // O que a tela mostra é o que ela manda: quem cria, já na abertura —
        // lido NA HORA, sem esperar a lista (que está atrasada).
        expect.soft(await janela.getByLabel('Responsável').inputValue(), 'o responsável na abertura').toBe(gestora.userId)
      }
      await janela.getByRole('button', { name: 'Criar lead' }).click()
      await expect(p.locator('dialog[open]')).toHaveCount(0, { timeout: 30_000 })
      if (comAtraso) await p.unroute('**/admin/oportunidades**')
    }

    await criar('Lead Um', false)
    await criar('Lead Dois', true)
    await criar('Lead Tres', true)
  })

  for (const n of ['Lead Um', 'Lead Dois', 'Lead Tres']) {
    await expect.poll(() => donoDe(n), { message: `o responsável de ${n}` }).toBe(gestora.userId)
  }
})

test('D1: o "Sem responsável" vazio de uma tela que não mostrou o campo não tira o dono; o escolhido na tela, sim', async ({ browser }) => {
  await como(browser, gestora, async p => {
    const rota = '/admin/oportunidades'
    // O campo vazio SEM a marca da tela (a página que não mostrou o select).
    const r1 = await chamarAcaoComFormulario(p, 'actions/leads.ts', 'createLead', rota, [undefined], {
      name: nome('Direto Sem Marca'), email: `sem.marca.${marca}@bellaris.invalid`, owner_id: '',
    })
    expect(r1.texto).toContain('"success":true')
    // E o mesmo vazio dito pela tela ("Sem responsável" escolhido à vista).
    const r2 = await chamarAcaoComFormulario(p, 'actions/leads.ts', 'createLead', rota, [undefined], {
      name: nome('Direto Com Marca'), email: `com.marca.${marca}@bellaris.invalid`, owner_id: '', _responsavelNaTela: '1',
    })
    expect(r2.texto).toContain('"success":true')
  })
  await expect.poll(() => donoDe('Direto Sem Marca')).toBe(gestora.userId)
  await expect.poll(() => donoDe('Direto Com Marca')).toBeNull()
})
