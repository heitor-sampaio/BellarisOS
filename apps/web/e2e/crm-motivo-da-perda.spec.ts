import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O motivo da perda (2026-10-21, decisão do Heitor: uma lista de motivos da
 * rede, editável, mais observação). Levar o card à etapa de desfecho "perdido"
 * pede o motivo; ele vai para o lead, para a linha do tempo e para o
 * relatório de motivos.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let sdr: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: sdr!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function leadNaPrimeira(nome: string) {
  const { data: et } = await db().from('crm_stages').select('id').eq('tenant_id', rede!.tenantId).eq('outcome', 'OPEN').order('position').limit(1).single<{ id: string }>()
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede!.tenantId, name: nome, phone: `55489${String(Date.now()).slice(-8)}`, crm_stage_id: et!.id,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}
const etapaPerdida = async () => (await db().from('crm_stages').select('id').eq('tenant_id', rede!.tenantId).eq('outcome', 'LOST').limit(1).single<{ id: string }>()).data!.id

test.beforeAll(async () => {
  rede = await criarOutraRede(`mp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  sdr = await criarMembro(`mps${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(l => l.id as string)
    if (ids.length) { await db().from('lead_events').delete().in('lead_id', ids); await db().from('leads').delete().in('id', ids) }
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  await sdr?.limpar(); await rede?.limpar()
})

test.describe.serial('o motivo da perda', () => {
  test('a rede nasce com os motivos de perda prontos', async () => {
    const { data } = await db().from('crm_motivos_perda').select('nome').eq('tenant_id', rede!.tenantId).eq('ativo', true).order('posicao')
    expect((data ?? []).map(m => m.nome)).toEqual(['Preço', 'Sem retorno', 'Fechou com outra clínica', 'Sem horário que sirva', 'Desistiu', 'Outro'])
  })

  test('levar o card a "Perdido" pede o motivo — e ele vai para o lead e para a linha do tempo', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/oportunidades`)
      const nome = `${PREFIXO} Perde ${marca}`
      const id = await leadNaPrimeira(nome)
      await p.reload()
      const card = p.locator(`[data-lead-id="${id}"]`).first()
      const coluna = p.locator('[data-coluna-desfecho="LOST"]').first()
      // O arraste nativo do HTML5 por eventos: o quadro rola na horizontal, e o
      // dragTo do mouse perde o card quando a coluna "Perdido" está fora da tela.
      await expect(card).toBeVisible()
      const dt = await p.evaluateHandle(() => new DataTransfer())
      await card.dispatchEvent('dragstart', { dataTransfer: dt })
      await coluna.dispatchEvent('dragenter', { dataTransfer: dt })
      await coluna.dispatchEvent('dragover', { dataTransfer: dt })
      await coluna.dispatchEvent('drop', { dataTransfer: dt })
      const janela = p.getByRole('dialog', { name: 'Por que perdeu?' })
      await expect(janela).toBeVisible()
      await janela.getByLabel('Motivo').selectOption({ label: 'Preço' })
      await janela.getByLabel('Observação').fill('achou caro o pacote')
      await janela.getByRole('button', { name: 'Marcar como perdido' }).click()
      await expect.poll(async () => (await db().from('leads').select('crm_stage_id').eq('id', id).single()).data?.crm_stage_id).toBe(await etapaPerdida())
      const { data: lead } = await db().from('leads').select('motivo_perda_obs, perdido_em, crm_motivos_perda(nome)').eq('id', id).single()
      expect(lead).toMatchObject({ motivo_perda_obs: 'achou caro o pacote', crm_motivos_perda: { nome: 'Preço' } })
      expect(lead?.perdido_em).toBeTruthy()
      const { data: ev } = await db().from('lead_events').select('changes').eq('lead_id', id).eq('type', 'STAGE_CHANGED')
      expect(JSON.stringify(ev)).toContain('Preço')
    })
  })

  test('pela action, sem o motivo, não perde', async ({ browser }) => {
    const id = await leadNaPrimeira(`${PREFIXO} Sem motivo ${marca}`)
    const perdida = await etapaPerdida()
    await como(browser, async p => {
      await p.goto(`/${slug}/oportunidades`)
      await chamarAcao(p, 'actions/leads.ts', 'updateLeadStage', `/${slug}/oportunidades`, [id, perdida, slug])
    })
    expect((await db().from('leads').select('crm_stage_id').eq('id', id).single()).data?.crm_stage_id).not.toBe(perdida)
  })

  test('o relatório conta os motivos do período', async () => {
    const { data, error } = await db().rpc('metrics_motivos_de_perda', {
      p_tenant: rede!.tenantId, p_from: new Date(Date.now() - 3600_000).toISOString(), p_to: new Date(Date.now() + 3600_000).toISOString(),
    })
    expect(error).toBeNull()
    expect(data).toEqual([{ motivo: 'Preço', total: 1 }])
  })

  test('a rede cria um motivo novo nas configurações do funil', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/oportunidades`)
      await expect(async () => {
        await p.getByRole('button', { name: 'Configurar funis' }).first().click({ timeout: 1000 })
        await expect(p.getByRole('heading', { name: 'Motivos de perda' })).toBeVisible({ timeout: 1000 })
      }).toPass()
      await p.getByLabel('Novo motivo').fill('Distância')
      await p.getByRole('button', { name: 'Adicionar motivo' }).click()
      await expect.poll(async () => (await db().from('crm_motivos_perda').select('nome').eq('tenant_id', rede!.tenantId).eq('nome', 'Distância')).data?.length).toBe(1)
    })
  })
})
