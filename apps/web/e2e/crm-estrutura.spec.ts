import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { capturarAcao, reenviarAcao } from './apoio/acao'

/**
 * Funis, etapas e oportunidades só se ligam a peças DA REDE.
 *
 * Três furos, todos de "o id veio do navegador e ninguém conferiu":
 *  - `setDefaultFunnel` com um id de funil alheio tirava o padrão de TODOS os
 *    funis da rede (o passo de marcar não atingia linha nenhuma) — a rede
 *    ficava sem funil padrão, e bastava um id qualquer;
 *  - `createStage` pendurava uma etapa desta rede no funil de outra;
 *  - `updateLeadStage` (o arrasto do quadro) movia o card para a etapa de
 *    outra rede — e ele sumia de todos os quadros desta.
 *
 * E as regras do quadro que nunca tinham teste: funil padrão não se arquiva
 * nem se apaga, funil com lead não se apaga, etapa com lead não se apaga.
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx {
  tenant: string; padraoOriginal: string
  funil: string; s1: string; s2: string; ganho: string; lead: string
  outra: OutraRede; funilAlheio: string; etapaAlheia: string
}
let f: Fx | null = null

test.beforeAll(async () => {
  const b = db()
  const tenant = await tenantId()
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const padrao = (await b.from('crm_funnels').select('id').eq('tenant_id', tenant).eq('is_default', true).single<{ id: string }>()).data!.id
  const funil = await ins('crm_funnels', { tenant_id: tenant, name: `${PREFIXO} Funil estrutura ${marca}`, position: 92 })
  const etapa = (nome: string, position: number, outcome = 'OPEN') =>
    ins('crm_stages', { tenant_id: tenant, funnel_id: funil, name: `${PREFIXO} ${nome}`, position, outcome })
  const s1 = await etapa('Novo', 0)
  const s2 = await etapa('Em contato', 1)
  const ganho = await etapa('Fechou', 2, 'WON')
  const lead = await ins('leads', { tenant_id: tenant, name: `${PREFIXO} Lead estrutura ${marca}`, phone: '5548944440001', crm_stage_id: s1 })

  const outra = await criarOutraRede(`crm${marca}`)
  const funilAlheio = await ins('crm_funnels', { tenant_id: outra.tenantId, name: `${PREFIXO} Funil alheio ${marca}`, position: 0, is_default: true })
  const etapaAlheia = await ins('crm_stages', { tenant_id: outra.tenantId, funnel_id: funilAlheio, name: `${PREFIXO} Etapa alheia`, position: 0, outcome: 'OPEN' })

  f = { tenant, padraoOriginal: padrao, funil, s1, s2, ganho, lead, outra, funilAlheio, etapaAlheia }
})

test.afterAll(async () => {
  if (!f) return
  const b = db()
  // Se algum passo mexeu no padrão, ele volta ao que era.
  const { data: padrao } = await b.from('crm_funnels').select('id').eq('tenant_id', f.tenant).eq('is_default', true)
  if ((padrao ?? []).map(p => p.id).join() !== f.padraoOriginal) {
    await b.from('crm_funnels').update({ is_default: false }).eq('tenant_id', f.tenant).neq('id', f.padraoOriginal)
    await b.from('crm_funnels').update({ is_default: true }).eq('id', f.padraoOriginal)
  }
  const { data: l } = await b.from('leads').select('contato_id').eq('id', f.lead).maybeSingle()
  await b.from('lead_events').delete().eq('lead_id', f.lead)
  await b.from('domain_events').delete().eq('entidade_id', f.lead)
  await b.from('leads').delete().eq('id', f.lead)
  if (l?.contato_id) await b.from('contacts').delete().eq('id', l.contato_id)
  // Etapas criadas pelo teste — nas duas redes, inclusive a que um furo teria plantado.
  await b.from('crm_stages').delete().in('funnel_id', [f.funil, f.funilAlheio])
  await b.from('crm_stages').delete().like('name', `${PREFIXO}%${marca}%`)
  await b.from('crm_funnels').delete().in('id', [f.funil, f.funilAlheio])
  await f.outra.limpar()
})

const padraoDaRede = async () =>
  ((await db().from('crm_funnels').select('id').eq('tenant_id', f!.tenant).eq('is_default', true)).data ?? []).map(x => x.id)
const etapaDoLead = async () =>
  (await db().from('leads').select('crm_stage_id').eq('id', f!.lead).single()).data?.crm_stage_id

test.describe.serial('estrutura do CRM', () => {
  test('funil padrão: um id de outra rede não tira o padrão da rede', async ({ page }) => {
    await chamarAcao(page, 'actions/crm-funnels.ts', 'setDefaultFunnel', '/admin/oportunidades', [f!.funilAlheio, ''])
    expect(await padraoDaRede(), 'a rede continua com o seu padrão').toEqual([f!.padraoOriginal])
    const { data } = await db().from('crm_funnels').select('is_default').eq('id', f!.funilAlheio).single()
    expect(data!.is_default, 'o funil alheio não foi mexido').toBe(true)
  })

  test('arrastar o card: etapa de outra rede é recusada; a da rede move', async ({ page }) => {
    await chamarAcao(page, 'actions/leads.ts', 'updateLeadStage', '/admin/oportunidades', [f!.lead, f!.etapaAlheia, ''])
    expect(await etapaDoLead(), 'o card não vai para a etapa alheia').toBe(f!.s1)
    await chamarAcao(page, 'actions/leads.ts', 'updateLeadStage', '/admin/oportunidades', [f!.lead, f!.s2, ''])
    await expect.poll(etapaDoLead, { message: 'a etapa da rede move (controle)' }).toBe(f!.s2)
  })

  test('regras do quadro: padrão não se arquiva nem apaga; com lead não se apaga', async ({ page }) => {
    const acao = (funcao: string, args: unknown[]) =>
      chamarAcao(page, `actions/${funcao.includes('Stage') ? 'crm-stages' : 'crm-funnels'}.ts`, funcao, '/admin/oportunidades', args)

    await acao('setFunnelArchived', [f!.padraoOriginal, true, ''])
    expect((await db().from('crm_funnels').select('archived_at').eq('id', f!.padraoOriginal).single()).data!.archived_at).toBeNull()
    await acao('deleteFunnel', [f!.padraoOriginal, ''])
    expect((await db().from('crm_funnels').select('id').eq('id', f!.padraoOriginal)).data).toHaveLength(1)

    // O funil de teste tem o lead (na etapa s2): nem o funil nem a etapa saem.
    await acao('deleteFunnel', [f!.funil, ''])
    expect((await db().from('crm_funnels').select('id').eq('id', f!.funil)).data).toHaveLength(1)
    await acao('deleteStage', [f!.s2, ''])
    expect((await db().from('crm_stages').select('id').eq('id', f!.s2)).data).toHaveLength(1)

    // Controle: a etapa SEM lead sai.
    await acao('deleteStage', [f!.s1, ''])
    await expect.poll(async () => (await db().from('crm_stages').select('id').eq('id', f!.s1)).data?.length).toBe(0)
  })

  test('criar etapa: o funil de outra rede é recusado; o da rede cria', async ({ page }) => {
    const nome = `${PREFIXO} Etapa nova ${marca}`
    await page.goto('/admin/oportunidades')
    await page.getByTitle('Configurar funis').click()
    // Seleciona o funil de TESTE (a etapa não entra no funil real).
    const linha = page.locator('div').filter({ has: page.locator(`input[value="${PREFIXO} Funil estrutura ${marca}"]`) }).last()
    await linha.getByText(/etapas?\b/).first().click()

    const chamada = capturarAcao(page, corpo => corpo.includes(f!.funil))
    await page.getByPlaceholder('Nome da etapa').fill(nome)
    await page.getByRole('button', { name: 'Adicionar' }).click()
    const req = await chamada
    const etapasCom = async (funil: string, n: string) =>
      ((await db().from('crm_stages').select('id').eq('funnel_id', funil).eq('name', n)).data ?? []).length
    await expect.poll(() => etapasCom(f!.funil, nome), { message: 'a tela cria no funil da rede' }).toBe(1)

    // O ataque: a mesma chamada, no funil de outra rede.
    await reenviarAcao(page, req, [[f!.funil, f!.funilAlheio], [nome, `${nome} alheia`]])
    expect(await etapasCom(f!.funilAlheio, `${nome} alheia`), 'nenhuma etapa no funil alheio').toBe(0)

    // Controle: o mesmo reenvio, no funil da rede, cria.
    await reenviarAcao(page, req, [[nome, `${nome} 2`]])
    await expect.poll(() => etapasCom(f!.funil, `${nome} 2`), { message: 'o reenvio funciona' }).toBe(1)
  })
})
