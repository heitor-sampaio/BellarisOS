import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

/**
 * AUT-02 da varredura de conformidade (18/11): "Automações e Campanhas são da
 * rede, e ficam só no portal da rede (D-2, o Heitor, 2026-10-29: 'a automação
 * é da clínica, mesmo que o alvo seja a unidade') … quem não tem 'A rede
 * inteira' não as alcança, tenha o módulo que tiver" (automacoes.md).
 *
 * As LEITURAS pediam só Automações em Ver: quem é de uma unidade, chamando a
 * action direto pelo id, lia as automações, as execuções e o "O que já
 * aconteceu" da rede inteira. O controle é o mesmo cargo com "A rede inteira".
 */

test.setTimeout(150_000)

const marca = Date.now().toString(36)
const nome = `${PREFIXO} Só da rede ${marca}`
const db = () => banco()
const RECUSADA = /BELLARIS_SEM_ACESSO|Forbidden/
let rede: OutraRede
let daUnidade: MembroDeTeste
let daRede: MembroDeTeste
let automacao = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`asr${marca}`)
  const { data, error } = await db().from('automations').insert({
    tenant_id: rede.tenantId, nome, status: 'RASCUNHO', gatilhos: [],
    grafo: { nos: [], ligacoes: [] },
    limites: { silencioDe: '21:00', silencioAte: '08:00', tetoPorClienteDia: 3 },
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  automacao = data!.id
  const permissoes = [{ modulo: 'automations' as const, nivel: 'VIEW' as const }]
  daUnidade = await criarMembro(`asru${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Vê automações (unidade)', permissoes })
  daRede = await criarMembro(`asrr${marca}`, { tenant: rede.tenantId, branchId: null, rotulo: 'Vê automações (rede)', permissoes })
})

test.afterAll(async () => {
  if (automacao) await db().from('automation_versions').delete().eq('automation_id', automacao)
  await db().from('automations').delete().eq('tenant_id', rede.tenantId)
  await daUnidade?.limpar(); await daRede?.limpar(); await rede?.limpar()
})

const leituras = (): [arquivo: string, funcao: string, rota: string, args: unknown[]][] => [
  ['actions/automacoes.ts', 'listarAutomacoes', '/admin/automacoes', []],
  ['actions/automacoes.ts', 'getAutomacao', `/admin/automacoes/${automacao}`, [automacao]],
  ['actions/automacoes.ts', 'listarExecucoes', `/admin/automacoes/${automacao}`, [automacao]],
  ['actions/eventos.ts', 'listarEventosDeDominio', '/admin/automacoes/eventos', [{}]],
]

test('quem é de uma unidade não lê as automações nem pela action; quem tem a rede inteira lê', async ({ browser }) => {
  await como(browser, daUnidade, async p => {
    for (const [arquivo, funcao, rota, args] of leituras()) {
      const r = await chamarAcao(p, arquivo, funcao, rota, args)
      expect(r.texto, `${funcao} chegou à action`).not.toContain('Server action not found')
      expect(r.texto, `${funcao} recusada a quem é da unidade`).toMatch(RECUSADA)
      expect(r.texto, `${funcao} não devolve a automação`).not.toContain(nome)
    }
  })
  await como(browser, daRede, async p => {
    const r = await chamarAcao(p, 'actions/automacoes.ts', 'listarAutomacoes', '/admin/automacoes', [])
    expect(r.texto, 'controle: a rede inteira lê').not.toMatch(RECUSADA)
    expect(r.texto).toContain(nome)
  })
})

test('AUT-03: quem só vê abre Execuções, Versões e Limites no editor, sem Salvar nem Ligar', async ({ browser }) => {
  await como(browser, daRede, async p => {
    await p.goto(`/admin/automacoes/${automacao}`)
    for (const gaveta of ['Execuções', 'Versões', 'Limites']) {
      await expect(p.getByRole('button', { name: gaveta, exact: true }), gaveta).toBeVisible()
    }
    await expect(p.getByRole('button', { name: 'Salvar' })).toHaveCount(0)
    await expect(p.getByRole('button', { name: /^Ligar$/ })).toHaveCount(0)
    await p.getByRole('button', { name: 'Execuções', exact: true }).click()
    await expect(p.getByRole('button', { name: /Ensaiar/ }), 'o ensaio é de Gerenciar').toHaveCount(0)
  })
})
