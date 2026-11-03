import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A comissão de uma Admin da rede, pelo PROCEDIMENTO (achado da compilação da
 * 5ª simulação, 2026-11-01). O CLAUDE.md §11 diz "somente admin pode alterar
 * admin" (revisão do Heitor, 2026-10-29), e a Equipe já recusava
 * (`salvarRegrasDoProfissional` → `recusaDeMexerNaAdmin`). Mas a comissão por
 * profissional também se grava pelo procedimento — o chip da coluna
 * "Comissão" e o modal do procedimento (`gravarComissaoDoProcedimento`) —, e
 * ali quem tinha o Financeiro em Gerenciar punha, mudava ou tirava o valor da
 * Admin sem ser Admin.
 *
 * A regra: o valor da Admin no procedimento (a exceção dela) só muda pelas
 * mãos de uma Admin. Quem não é Admin continua mexendo no dos outros — e o
 * envio que deixa o da Admin como estava passa.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let financeiro: MembroDeTeste | null = null
test.describe.configure({ timeout: 120_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`cpa${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cpad${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  expect((await db().from('users').update({ provides_services: true }).eq('id', dona.userId)).error).toBeNull()
  financeiro = await criarMembro(`cpaf${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'procedures', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('commission_rules').delete().eq('tenant_id', rede.tenantId)
  await financeiro?.limpar(); await dona?.limpar(); await rede?.limpar()
})

const regras = async () => {
  const { data, error } = await db().from('commission_rules').select('professional_id, type, value')
    .eq('procedure_id', rede!.procedureId).eq('is_active', true).order('professional_id')
  expect(error).toBeNull()
  return (data ?? []).map(r => ({ quem: r.professional_id === dona!.userId ? 'dona' : r.professional_id === rede!.professionalId ? 'prof' : r.professional_id, valor: Number(r.value) }))
    .sort((a, b) => String(a.quem).localeCompare(String(b.quem)))
}

const salvar = (p: Page, entrada: unknown) =>
  chamarAcao(p, 'actions/comissoes.ts', 'salvarComissaoDoProcedimento', '/admin/procedures', [rede!.procedureId, entrada])
const porProfissional = (...linhas: [string, number][]) => ({
  modo: 'POR_PROFISSIONAL', profissionais: linhas.map(([id, valor]) => ({ professional_id: id, tipo: 'PERCENTAGE', valor })),
})
// A rede de teste tem UMA unidade: a recusa fala "Admin", não "Admin da rede" (r2-cfg-02).
const RECUSA = 'Só quem é Admin altera a comissão de uma Admin.'

test('quem não é Admin da rede não põe, não muda e não tira o valor da Admin no procedimento; a Admin muda', async ({ browser }) => {
  await como(browser, financeiro!, async p => {
    // Pôr um valor para a Admin: recusado.
    expect((await salvar(p, porProfissional([dona!.userId, 50]))).texto).toContain(RECUSA)
    expect(await regras(), 'nada gravado').toEqual([])
    // Controle: o de quem não é Admin grava.
    expect((await salvar(p, porProfissional([rede!.professionalId, 20]))).texto).toContain('"ok":true')
    expect(await regras()).toEqual([{ quem: 'prof', valor: 20 }])
  })

  // A Admin põe o dela (e mantém o do profissional).
  await como(browser, dona!, async p => {
    expect((await salvar(p, porProfissional([dona!.userId, 50], [rede!.professionalId, 20]))).texto).toContain('"ok":true')
  })
  expect(await regras()).toEqual([{ quem: 'dona', valor: 50 }, { quem: 'prof', valor: 20 }])

  await como(browser, financeiro!, async p => {
    // Mudar o valor dela, tirá-lo da lista ou trocar tudo por "a mesma para todos": recusado.
    expect((await salvar(p, porProfissional([dona!.userId, 10], [rede!.professionalId, 20]))).texto).toContain(RECUSA)
    expect((await salvar(p, porProfissional([rede!.professionalId, 20]))).texto).toContain(RECUSA)
    expect((await salvar(p, { modo: 'GERAL', geral: { tipo: 'PERCENTAGE', valor: 30 } })).texto).toContain(RECUSA)
    expect(await regras(), 'o da Admin ficou como estava').toEqual([{ quem: 'dona', valor: 50 }, { quem: 'prof', valor: 20 }])
    // O envio que deixa o dela como está e muda o do profissional passa.
    expect((await salvar(p, porProfissional([dona!.userId, 50], [rede!.professionalId, 25]))).texto).toContain('"ok":true')
  })
  expect(await regras()).toEqual([{ quem: 'dona', valor: 50 }, { quem: 'prof', valor: 25 }])
})
