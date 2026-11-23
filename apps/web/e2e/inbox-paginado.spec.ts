import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O inbox vem de 30 em 30, filtrado no banco (migration 20260928000007).
 *
 * Era as 200 conversas mais recentes, filtradas no navegador: a 201ª nunca
 * aparecia — nem rolando, nem procurando por ela. (O caso do modo "pela
 * conversa" do "só os meus" saiu com ele: SM3, o Heitor, 2026-11-23.)
 *
 * Numa rede `[e2e]` própria, para a contagem ser exata.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (i: number) => `${PREFIXO} Pessoa ${String(i).padStart(2, '0')} ${marca}`
const TOTAL = 45

interface Fx { outra: OutraRede; rede: MembroDeTeste; convIds: string[] }
let f: Fx | null = null
const criado: { outra?: OutraRede; membros: MembroDeTeste[]; convIds: string[] } = { membros: [], convIds: [] }

test.beforeAll(async () => {
  const b = db()
  const outra = await criarOutraRede(`pg${marca}`)
  criado.outra = outra

  // 45 conversas, um minuto entre cada: a 01 é a mais recente, a 45 a mais antiga.
  const agora = Date.now()
  const linhas = Array.from({ length: TOTAL }, (_, k) => {
    const i = k + 1
    // Sem o dígito 4 depois do DDD: a busca casa cada palavra também com o
    // telefone, e "Pessoa 44" achava a conversa cujo número (tirado do relógio)
    // tivesse "44" — falhava conforme a hora. O índice vai em base 9 sem o 4.
    const SEM_4 = '012356789'
    const fone = '5548' + String(agora).slice(-7).replace(/4/g, '0') + SEM_4[Math.floor(i / 9)] + SEM_4[i % 9]
    return {
      tenant_id: outra.tenantId, channel: 'whatsapp', status: 'open', provider: 'uazapi',
      contact_name: nome(i), contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
      last_message_at: new Date(agora - i * 60_000).toISOString(), last_message: 'oi',
      // Só a mais antiga tem não lidas — é o alvo do filtro.
      unread_count: i === TOTAL ? 3 : 0,
    }
  })
  const { data, error } = await b.from('conversations').insert(linhas).select('id')
  expect(error, 'criar as conversas').toBeNull()
  criado.convIds.push(...(data ?? []).map(c => c.id as string))

  const membro = async (chave: string) => {
    const m = await criarMembro(`pg${chave}${marca}`, {
      tenant: outra.tenantId, rotulo: `CRM ${chave}`, permissoes: [{ modulo: 'crm', nivel: 'VIEW' }],
    })
    criado.membros.push(m); return m
  }
  f = { outra, rede: await membro('rede'), convIds: criado.convIds }
})

test.afterAll(async () => {
  if (!criado.outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const t = criado.outra.tenantId
  olhar('desligar as conversas', await b.from('conversations').update({ lead_id: null }).eq('tenant_id', t))
  // Em lotes até esvaziar: um select só pararia em 1000 — o mesmo teto que
  // este arquivo existe para provar que o inbox não tem mais. Lotes de 150 ids:
  // com 300 o endereço do `in` passa de 11 kB, e o gateway do banco de testes
  // local recusa ("URI too long") — o da nuvem aceita.
  for (let volta = 0; volta < 40; volta++) {
    const { data: ls } = await b.from('leads').select('id').eq('tenant_id', t).limit(150)
    const lote = ((ls ?? []) as { id: string }[]).map(l => l.id)
    if (lote.length === 0) break
    olhar('histórico', await b.from('lead_events').delete().in('lead_id', lote))
    olhar('leads', await b.from('leads').delete().in('id', lote))
  }
  const { data: cs } = await b.from('conversations').select('id').eq('tenant_id', t)
  await apagarConversas(((cs ?? []) as { id: string }[]).map(c => c.id))
  olhar('pessoas', await b.from('contacts').delete().eq('tenant_id', t))
  for (const m of criado.membros) await m.limpar()
  await criado.outra.limpar()
  expect(falhas).toEqual([])
})

async function comInbox(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/inbox')
    await expect(p.locator('button.inbox-conversa').first()).toBeVisible()
    await fn(p)
  } finally { await ctx.close() }
}

const linhas = (p: Page) => p.locator('button.inbox-conversa')

test.describe.serial('inbox paginado', () => {
  test('abre com 30 e traz o resto ao rolar até o fim', async ({ browser }) => {
    await comInbox(browser, f!.rede, async p => {
      await expect(linhas(p)).toHaveCount(30)
      await expect(p.getByText(nome(TOTAL))).toHaveCount(0)

      await linhas(p).last().scrollIntoViewIfNeeded()
      await expect(linhas(p)).toHaveCount(TOTAL, { timeout: 15_000 })
      await expect(linhas(p).filter({ hasText: nome(TOTAL) })).toHaveCount(1)
      // Ordem preservada: a última da lista é a mais antiga.
      await expect(linhas(p).last()).toContainText(nome(TOTAL))
    })
  })

  test('busca e filtro acham a conversa que não está na primeira página', async ({ browser }) => {
    await comInbox(browser, f!.rede, async p => {
      await p.getByPlaceholder('Pesquisar…').fill(`Pessoa 44 ${marca}`)
      await expect(linhas(p)).toHaveCount(1, { timeout: 10_000 })
      await expect(linhas(p).first()).toContainText(nome(44))

      await p.getByPlaceholder('Pesquisar…').fill('')
      await expect(linhas(p)).toHaveCount(30, { timeout: 10_000 })

      await p.locator('[title="Filtrar conversas"]').click()
      await p.getByRole('button', { name: 'Não lidas', exact: true }).click()
      await expect(linhas(p)).toHaveCount(1, { timeout: 10_000 })
      await expect(linhas(p).first()).toContainText(nome(TOTAL))
    })
  })
})
