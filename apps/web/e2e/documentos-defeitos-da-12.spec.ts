import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { euVendiOPlano, receberPlanoNoPdv } from './apoio/vender'

/**
 * D6 da 12ª simulação (2026-11-10/11, a Bianca da [sim] Clínica Acácia): o
 * contrato do plano no cartão Visa 6x saiu assinado com "Entrada: , em 6
 * parcelas de R$ 105,00, primeiro vencimento em ." — a cláusula da dona juntava
 * `pagamento.forma` (a frase inteira) com as opcionais, que saem vazias quando
 * o pagamento não as tem. Nada avisava. Agora o passo Documentação do checkout
 * (onde se colhe e se manda o link) diz quais saem vazias NESTE plano. Nada se
 * bloqueia (princípio 2). Numa rede [e2e] própria, com um contrato de plano
 * com a cláusula do relatório.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
const CLAUSULA = '# Contrato do plano\n\nPagamento: {{pagamento.forma}} Entrada: {{pagamento.entrada}}, em {{pagamento.parcelas}} parcelas de {{pagamento.valor_parcela}}, primeiro vencimento em {{pagamento.primeiro_vencimento}}.\n\nEu, {{cliente.nome}}, concordo.\n\n[[assinatura]]'

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`doc12${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Contrato do plano ${marca}`, p_tipo: 'CONTRATO_PLANO', p_origem: 'EDITOR',
    p_momento: null, p_exigencia: 'AVISA', p_texto: CLAUSULA,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: ['pagamento.forma', 'pagamento.entrada', 'pagamento.parcelas', 'pagamento.valor_parcela', 'pagamento.primeiro_vencimento', 'cliente.nome'],
    p_usa_pagamento: true, p_ator: null,
  })
  expect(error, 'o contrato de plano da rede').toBeNull()
  gestor = await criarMembro(`doc12g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestao',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  await gestor?.limpar()
  await rede?.limpar()
})

test('D6: no checkout à vista, o contrato diz que a entrada, as parcelas e o vencimento saem vazios', async ({ browser }) => {
  const { planId, clientId } = await rede.criarPlanoProposto('Plano D6', { semTermo: true })
  expect((await db().from('clients').update({ document: '52998224725' }).eq('id', clientId)).error).toBeNull()
  await como(browser, async p => {
    // O receber do plano é no PDV (fase 3, PT1b) — quem recebe também aceita.
    const janela = await receberPlanoNoPdv(p, '/admin', planId)
    await janela.getByRole('button', { name: 'Confirmar plano' }).click()
    await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
    await euVendiOPlano(p)
    await janela.getByRole('button', { name: 'Ir para a documentação' }).click()
    const contrato = janela.locator('[data-documento]').filter({ hasText: 'Contrato do plano' })
    await expect(contrato).toBeVisible()
    const aviso = contrato.locator('[data-variaveis-vazias]')
    await expect(aviso).toContainText('Valor da entrada')
    await expect(aviso).toContainText('Primeiro vencimento')
    await expect(aviso).toContainText('a forma de pagamento já é a frase completa')
    // Só aviso: colher e mandar o link continuam (princípio 2).
    await expect(contrato.getByRole('button', { name: 'Colher assinatura' })).toBeEnabled()
    await expect(contrato.getByRole('button', { name: 'Enviar link de assinatura' })).toBeVisible()
  })
})
