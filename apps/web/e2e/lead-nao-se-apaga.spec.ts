import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Oportunidade não se apaga (decisão do Heitor, 2026-09-28).
 *
 * A action e o botão saíram do app; o que este teste prova é o caminho que
 * sobrava: o PostgREST com o token de um membro — a chave pública está no
 * navegador (§4). As políticas eram FOR ALL, e apagar levava junto o histórico.
 *
 * Controle: o mesmo membro LÊ o lead e o histórico — sem ele, "não apagou"
 * poderia ser só uma sessão que não alcança nada. (A sessão nunca pôde editar
 * lead: a política que parecia dar isso comparava a claim no lugar errado.)
 */

const marca = Date.now().toString(36)
const db = () => banco()

let outra: OutraRede | null = null
let membro: MembroDeTeste | null = null
let lead: string | null = null

test.beforeAll(async () => {
  outra = await criarOutraRede(`lead${marca}`)
  membro = await criarMembro(`lead${marca}`, {
    tenant: outra.tenantId, rotulo: 'CRM', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }],
  })
  const { data, error } = await db().from('leads')
    .insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Lead fica ${marca}`, phone: '5548900000' + String(Date.now()).slice(-3) })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  lead = data!.id
  const { error: eEv } = await db().from('lead_events').insert({ tenant_id: outra.tenantId, lead_id: lead, type: 'CREATED' })
  expect(eEv).toBeNull()
})

test.afterAll(async () => {
  if (!outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  if (lead) {
    const { data: l } = await b.from('leads').select('contato_id').eq('id', lead).maybeSingle()
    olhar('lead', await b.from('leads').delete().eq('id', lead))   // o service role (o teste) ainda apaga
    if (l?.contato_id) olhar('contato', await b.from('contacts').delete().eq('id', l.contato_id))
  }
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

test('o membro lê o lead e o histórico, mas não apaga nenhum dos dois', async () => {
  const sessao = comoMembro()

  const { data: apagados } = await sessao.from('leads').delete().eq('id', lead!).select('id')
  expect(apagados ?? [], 'nenhuma linha apagada').toEqual([])
  const { data: evApagados } = await sessao.from('lead_events').delete().eq('lead_id', lead!).select('id')
  expect(evApagados ?? [], 'o histórico fica').toEqual([])

  const { count: restaLead } = await db().from('leads').select('id', { count: 'exact', head: true }).eq('id', lead!)
  const { count: restaEv }   = await db().from('lead_events').select('id', { count: 'exact', head: true }).eq('lead_id', lead!)
  expect([restaLead, restaEv]).toEqual([1, 1])

  // Controle: a mesma sessão alcança os dois.
  const { data: lido } = await sessao.from('leads').select('id').eq('id', lead!)
  const { data: hist } = await sessao.from('lead_events').select('id').eq('lead_id', lead!)
  expect([lido?.length, hist?.length]).toEqual([1, 1])
})
