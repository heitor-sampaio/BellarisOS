import { expect, type Browser, type Page } from '@playwright/test'
import { banco } from './banco'
import { criarOutraRede, type OutraRede } from './outra-rede'
import { criarMembro, type MembroDeTeste, type Permissao } from './sessao'
import { PORTA_DA_OPENAI_FALSA } from './openai-falsa'

/**
 * O apoio dos specs do Copilot.
 *
 * Cada spec roda numa rede `[e2e]` própria (`criarOutraRede`), sem retrato de
 * plano — sem plano, tudo liberado, inclusive o Copilot — com o DONO dela
 * logado. A OpenAI é a falsa (porta fixa): os specs do Copilot ficam nos
 * COMPARTILHADOS, um por vez.
 */

export const OPENAI_FALSA = `http://127.0.0.1:${PORTA_DA_OPENAI_FALSA}/v1`
export const contraAFalsa = () => process.env.OPENAI_BASE_URL_TESTE === OPENAI_FALSA

export interface RedeDoCopilot {
  outra: OutraRede
  dono: MembroDeTeste
  /** Um membro da MESMA rede com o cargo que o teste descrever. */
  membro(marca: string, permissoes: Permissao[], opcoes?: { branchId?: string | null }): Promise<MembroDeTeste>
  /** Grava um retrato de plano (funcionalidades) na rede; `null` volta a "sem plano". */
  plano(funcionalidades: string[] | null, cotaDoCopilot?: number | null): Promise<void>
  limpar(): Promise<void>
}

export async function redeDoCopilot(marca: string): Promise<RedeDoCopilot> {
  const db = banco()
  const outra = await criarOutraRede(`cop${marca}`)
  // A rede [e2e] já configurada: senão o dono cai no /setup em vez do portal.
  expect((await db.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
  const dono = await criarMembro(`copd${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [], rotulo: 'Dono' })
  const membros: MembroDeTeste[] = []
  let planoBase: string | null = null

  return {
    outra, dono,
    async membro(m, permissoes, opcoes = {}) {
      const novo = await criarMembro(`copm${m}${marca}`, { tenant: outra.tenantId, permissoes, branchId: opcoes.branchId ?? null })
      membros.push(novo)
      return novo
    },
    async plano(funcionalidades, cotaDoCopilot = null) {
      if (funcionalidades === null) {
        expect((await db.from('tenant_subscriptions').delete().eq('tenant_id', outra.tenantId)).error).toBeNull()
      } else {
        if (!planoBase) {
          const { data, error } = await db.from('platform_plans').insert({ nome: `[e2e] Plano copilot ${marca}`, valor_centavos: 0 }).select('id').single<{ id: string }>()
          expect(error, 'criar o plano base').toBeNull()
          planoBase = data!.id
        }
        const recursos = {
          funcionalidades, limites: { unidades: null, membros: null, whatsapp: null },
          ...(cotaDoCopilot ? { cotas: { copilot: cotaDoCopilot } } : {}),
        }
        const { error } = await db.from('tenant_subscriptions')
          .upsert({ tenant_id: outra.tenantId, plan_id: planoBase, valor_centavos: 0, recursos }, { onConflict: 'tenant_id' })
        expect(error, 'gravar o retrato do plano').toBeNull()
      }
      await expirarRede(outra.tenantId)
    },
    async limpar() {
      for (const m of membros) await m.limpar()
      await dono.limpar()
      await db.from('platform_audit_log').delete().eq('tenant_id', outra.tenantId)
      await db.from('tenant_subscriptions').delete().eq('tenant_id', outra.tenantId)
      await outra.limpar()
      if (planoBase) await db.from('platform_plans').delete().eq('id', planoBase)
    },
  }
}

/** Expira o cache da rede na clínica (`rede:<id>`), como o sistema faz depois de mudar o plano. */
export async function expirarRede(tenantId: string) {
  const r = await fetch(`${process.env.E2E_BASE_URL}/api/interno/expirar`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.INTERNO_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tags: [`rede:${tenantId}`] }),
  })
  expect(r.status).toBe(200)
}

export async function comSessao(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Abre o painel e manda uma mensagem pela tela. Devolve o painel. */
export async function falarComOCopilot(p: Page, mensagem: string) {
  const painel = p.getByRole('dialog', { name: 'Copilot' })
  if (!(await painel.isVisible())) await p.getByRole('button', { name: 'Copilot', exact: true }).click()
  await painel.getByRole('textbox', { name: 'Mensagem para o Copilot' }).fill(mensagem)
  await painel.getByRole('button', { name: 'Enviar' }).click()
  return painel
}

/** Espera o Copilot terminar de responder (o campo volta a aceitar envio). */
export async function esperarResposta(p: Page) {
  const painel = p.getByRole('dialog', { name: 'Copilot' })
  // Enquanto responde, o microfone fica travado; terminou, ele volta.
  await expect(painel.getByRole('button', { name: 'Gravar áudio' })).toBeEnabled({ timeout: 30_000 })
  await expect(painel.locator('.copilot-pensando')).toHaveCount(0, { timeout: 30_000 })
}
