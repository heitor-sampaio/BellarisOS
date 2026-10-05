import { test, expect, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O quadro de oportunidades muda sozinho, sem recarregar
 * (migration 20260928000006).
 *
 * A tela assina o SINAL da rede (`crm_quadro_sinais`), marcado por gatilho em
 * leads, etapas e funis — não os dados. Antes quase nada chegava: funis fora da
 * publicação, a política de etapas nunca valia e lead só chegava a quem é da
 * rede. Aqui o banco é mexido por fora, com a página já aberta, e a tela tem de
 * mudar — para quem é da rede E para quem é de unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx { outra: OutraRede; rede: MembroDeTeste; unidade: MembroDeTeste; slug: string; funil: string; etapa: string }
let f: Fx | null = null
const criado: { outra?: OutraRede; membros: MembroDeTeste[] } = { membros: [] }

test.beforeAll(async () => {
  const b = db()
  const outra = await criarOutraRede(`rt${marca}`)
  criado.outra = outra
  const { data: br } = await b.from('branches').select('slug').eq('id', outra.branchId).single()
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const funil = await ins('crm_funnels', { tenant_id: outra.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true })
  const etapa = await ins('crm_stages', { tenant_id: outra.tenantId, funnel_id: funil, name: 'Primeiro contato', position: 0 })
  const membro = async (chave: string, branchId?: string) => {
    const m = await criarMembro(`rt${chave}${marca}`, {
      tenant: outra.tenantId, branchId, rotulo: `CRM ${chave}`, permissoes: [{ modulo: 'crm', nivel: 'VIEW' }],
    })
    criado.membros.push(m); return m
  }
  f = { outra, rede: await membro('rede'), unidade: await membro('un', outra.branchId), slug: br!.slug as string, funil, etapa }
})

test.afterAll(async () => {
  if (!criado.outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const t = criado.outra.tenantId
  const { data: ls } = await b.from('leads').select('id, contato_id').eq('tenant_id', t)
  const leads = (ls ?? []) as { id: string; contato_id: string | null }[]
  if (leads.length) {
    olhar('histórico', await b.from('lead_events').delete().in('lead_id', leads.map(l => l.id)))
    olhar('leads', await b.from('leads').delete().in('id', leads.map(l => l.id)))
  }
  olhar('pessoas', await b.from('contacts').delete().eq('tenant_id', t))
  olhar('etapas', await b.from('crm_stages').delete().eq('tenant_id', t))
  olhar('funis', await b.from('crm_funnels').delete().eq('tenant_id', t))
  olhar('sinal', await b.from('crm_quadro_sinais').delete().eq('tenant_id', t))
  for (const m of criado.membros) await m.limpar()
  await criado.outra.limpar()
  expect(falhas).toEqual([])
})

async function comQuadroAberto(browser: Browser, quem: MembroDeTeste, url: string, fn: (p: import('@playwright/test').Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(url)
    await expect(p.getByRole('heading', { name: 'Oportunidades' })).toBeVisible()
    // A assinatura sobe depois da hidratação: espera o canal confirmar (o
    // RealtimeRefresher marca), em vez de chutar um tempo — sob a carga da
    // completa, 2,5 s não bastavam e o sinal saía antes de alguém escutar.
    await expect(p.locator('[data-tempo-real="crm_quadro_sinais"]')).toHaveAttribute('data-estado', 'ligado', { timeout: 30_000 })
    await fn(p)
  } finally { await ctx.close() }
}

test('quem é da rede vê o lead novo aparecer, sem recarregar', async ({ browser }) => {
  const nome = `${PREFIXO} Lead ao vivo ${marca}`
  await comQuadroAberto(browser, f!.rede, '/admin/oportunidades', async p => {
    await expect(p.getByText(nome)).toHaveCount(0)
    const { error } = await db().from('leads').insert({
      tenant_id: f!.outra.tenantId, name: nome, phone: '5548900' + String(Date.now()).slice(-6), crm_stage_id: f!.etapa,
    })
    expect(error).toBeNull()
    await expect(p.locator('.crm-card').filter({ hasText: nome })).toBeVisible({ timeout: 30_000 })
  })
})

test('quem é de unidade vê a etapa renomeada, sem recarregar', async ({ browser }) => {
  const novo = `Qualificado ${marca}`
  await comQuadroAberto(browser, f!.unidade, `/${f!.slug}/oportunidades`, async p => {
    // O nome também está nas <option> dos seletores escondidos: só o que aparece.
    const visivel = (t: string) => p.locator(`text=${t} >> visible=true`).first()
    await expect(visivel('Primeiro contato')).toBeVisible()
    const { error } = await db().from('crm_stages').update({ name: novo }).eq('id', f!.etapa)
    expect(error).toBeNull()
    await expect(visivel(novo)).toBeVisible({ timeout: 30_000 })
  })
})
