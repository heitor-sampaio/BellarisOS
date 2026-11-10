import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'

/**
 * A42 da 10ª simulação (2026-11-10): a Ana Clara, importada com o pacote de
 * antes (5 de 8 sessões feitas no sistema anterior), via no Histórico do app só
 * os 2 atendimentos do sistema — as sessões de antes apareciam só na home, como
 * "Pacote de antes: 3 de 8 restantes". O Histórico diz o que veio de antes: as
 * sessões feitas e a última visita, sem inventar atendimento (nada de data,
 * profissional ou nota que não existiu).
 *
 * Numa rede [e2e] própria.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`ph10${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`ph10c${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  expect((await db().from('clients').update({ ultima_visita_antes: '2026-09-12' }).eq('id', cliente.clientId)).error).toBeNull()
  const { error } = await db().rpc('pacote_trazer', {
    p_tenant: rede.tenantId, p_cliente: cliente.clientId, p_unidade: rede.branchId, p_procedimento: rede.procedureId,
    p_total: 8, p_usadas: 5, p_validade: null, p_valor: null, p_ator: null,
  })
  expect(error).toBeNull()
})

test.afterAll(async () => { await cliente?.limpar(); await rede?.limpar() })

test('A42: o Histórico do app mostra as sessões de antes e a última visita de antes', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/cliente/historico`)
    const deAntes = p.locator('[data-de-antes-do-sistema]')
    await expect(deAntes).toContainText(`5 sessões de ${PREFIXO} Proc ph10${marca}`)
    await expect(deAntes).toContainText('12/09/2026')
    // E não diz "Nenhum procedimento realizado ainda" para quem já tem sessões de antes.
    await expect(p.getByText('Nenhum procedimento realizado ainda.')).toHaveCount(0)
  } finally { await ctx.close() }
})
