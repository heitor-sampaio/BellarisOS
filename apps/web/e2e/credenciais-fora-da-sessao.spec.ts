import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Credencial não chega ao navegador de ninguém (migration 20260928000005).
 *
 * `integration_configs` (token da Meta, do Google, segredo do app) e
 * `whatsapp_numbers` (token de cada número) tinham política que só conferia a
 * REDE: qualquer membro — uma recepcionista, um SDR — lia os tokens falando
 * direto com o PostgREST pela chave pública (§4). `whatsapp_number_users`
 * deixava qualquer membro da rede mudar quem fala por cada número.
 *
 * Nenhuma tela lê essas tabelas pelo navegador (tudo passa pelo servidor, com
 * o cliente de serviço) e nenhuma está no realtime: a sessão perde o acesso
 * inteiro, e o app não sente.
 *
 * Controle: a mesma sessão lê a própria unidade — sem ele, "não leu" poderia
 * ser só um token que não alcança nada.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const SEGREDO = `segredo-e2e-${marca}`

let outra: OutraRede | null = null
let membro: MembroDeTeste | null = null
let caixa = ''

test.beforeAll(async () => {
  outra = await criarOutraRede(`cred${marca}`)
  membro = await criarMembro(`cred${marca}`, {
    tenant: outra.tenantId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'VIEW' }],
  })
  const b = db()
  const { error: e1 } = await b.from('integration_configs').insert({
    tenant_id: outra.tenantId, provider: 'meta_ads', is_active: true,
    config: { accessToken: SEGREDO, adAccountId: '1', pixelId: '2' },
  })
  expect(e1).toBeNull()
  const { data: n, error: e2 } = await b.from('whatsapp_numbers').insert({
    tenant_id: outra.tenantId, provider: 'uazapi', label: `${PREFIXO} Caixa ${marca}`, is_active: true,
    config: { token: SEGREDO, baseUrl: 'https://e2e.invalido' },
  }).select('id').single<{ id: string }>()
  expect(e2).toBeNull()
  caixa = n!.id
})

test.afterAll(async () => {
  if (!outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  olhar('vínculos', await b.from('whatsapp_number_users').delete().eq('tenant_id', outra.tenantId))
  olhar('caixa', await b.from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId))
  olhar('integrações', await b.from('integration_configs').delete().eq('tenant_id', outra.tenantId))
  await membro?.limpar()
  await outra.limpar()
  expect(falhas).toEqual([])
})

function comoMembro(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${membro!.accessToken}` } },
  })
}

test('o membro não lê nem mexe em credencial nenhuma; a unidade dele continua legível', async () => {
  const sessao = comoMembro()

  const { data: integracoes } = await sessao.from('integration_configs').select('config')
  expect(JSON.stringify(integracoes ?? []), 'token de anúncio').not.toContain(SEGREDO)
  const { data: caixas } = await sessao.from('whatsapp_numbers').select('config')
  expect(JSON.stringify(caixas ?? []), 'token do WhatsApp').not.toContain(SEGREDO)

  const { data: renomeada } = await sessao.from('whatsapp_numbers').update({ label: 'invasão' }).eq('id', caixa).select('id')
  expect(renomeada ?? [], 'não renomeia a caixa').toEqual([])
  const { error: vinculo } = await sessao.from('whatsapp_number_users')
    .insert({ tenant_id: outra!.tenantId, whatsapp_number_id: caixa, user_id: membro!.userId })
  expect(vinculo, 'não se liga sozinho a um número').not.toBeNull()

  // O banco confirma: nada mudou.
  const { data: linha } = await db().from('whatsapp_numbers').select('label').eq('id', caixa).single()
  expect(linha!.label).toBe(`${PREFIXO} Caixa ${marca}`)

  // Controle: a mesma sessão alcança a própria rede.
  const { data: unidades } = await sessao.from('branches').select('id').eq('tenant_id', outra!.tenantId)
  expect((unidades ?? []).length, 'a sessão enxerga a rede dela').toBeGreaterThan(0)
})
