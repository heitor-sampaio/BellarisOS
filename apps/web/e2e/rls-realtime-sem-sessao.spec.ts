import { test, expect } from '@playwright/test'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * F26 (3ª completa de 2026-11-05): a tela aberta SEM sessão derrubava o tempo
 * real de todo mundo.
 *
 * O cliente do Realtime no navegador fala como anônimo quando o servidor não dá
 * token (a sessão caiu, o membro foi desativado, o suporte encerrou) — e a aba
 * continua inscrita. O Realtime confere a RLS de cada mudança para cada
 * inscrito, num lote só; as políticas de `appointments`, `clients`,
 * `client_packages`, `client_notifications` (pela `private.clientes_do_login`),
 * `medical_record_entries` (`private.prontuario_da_minha_rede`) e
 * `user_notifications` (`private.suporte_encerrada`) ESTOURAVAM para o papel
 * `anon` (sem EXECUTE / sem o schema `private`), e o Realtime descarta o lote
 * inteiro em que uma política estoura: o agendamento novo não chegava nem a
 * quem estava logado. Nos logs do Realtime da completa: dezenas de
 * "permission denied for function clientes_do_login" — e a conversa nova do
 * `inbox-realtime` chegou 38 s depois.
 *
 * O teste fala com o Realtime como um anônimo E como um membro da rede, os
 * dois inscritos em `appointments`, e grava um agendamento: o membro tem de
 * recebê-lo.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let membro: MembroDeTeste | null = null
const clientes: SupabaseClient[] = []

function clienteDoRealtime(token: string | null): SupabaseClient {
  const c = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(token ? { accessToken: async () => token } : {}),
  })
  if (token) c.realtime.setAuth(token)
  clientes.push(c)
  return c
}

async function inscrito(canal: RealtimeChannel): Promise<void> {
  await new Promise<void>((ok, falhou) => {
    const limite = setTimeout(() => falhou(new Error('o canal não confirmou a inscrição')), 30_000)
    canal.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(limite); ok() }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(limite); falhou(new Error(`canal: ${status}`)) }
    })
  })
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`rts${marca}`)
  membro = await criarMembro(`rtsm${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  for (const c of clientes) await c.removeAllChannels()
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await membro?.limpar()
  await rede?.limpar()
})

test('uma aba sem sessão inscrita no tempo real não apaga o evento de quem está logado', async () => {
  test.setTimeout(120_000)
  // 1. A aba que perdeu a sessão: o Realtime como anônimo, inscrito em TODAS
  //    as tabelas do tempo real (a política nova de qualquer uma entra aqui).
  const anonimo = clienteDoRealtime(null)
  await inscrito(anonimo.channel(`anon-${marca}`)
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {}))

  // 2. A recepção logada, inscrita na agenda da unidade dela.
  const recebidos: string[] = []
  const logado = clienteDoRealtime(membro!.accessToken)
  await inscrito(logado.channel(`membro-${marca}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments', filter: `branch_id=eq.${rede!.branchId}` },
      p => { recebidos.push((p.new as { id: string }).id) }))

  // 3. Um agendamento novo na unidade.
  const cliente = await rede!.criarCliente('Tempo real')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()

  await expect.poll(() => recebidos, { timeout: 30_000, message: 'a recepção logada recebeu o agendamento novo' })
    .toContain(data!.id)
})
