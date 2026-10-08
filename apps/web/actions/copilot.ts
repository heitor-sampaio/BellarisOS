'use server'

import { revalidatePath } from 'next/cache'
import type { TenantContext } from '@estetica-os/types'
import { getTenantContext } from '@/lib/auth'
import { copilotNoPlano } from '@/lib/copilot/disponivel'
import { semAcesso } from '@/lib/sem-acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/db'
import { copilotConfigurado } from '@/lib/copilot/openai'
import { apagarConversa, conversaDaPessoa, listarConversas, mensagensParaATela } from '@/lib/copilot/conversa'
import { decidirAcao } from '@/lib/copilot/executor'
import type { ConversaNaLista, MensagemNaTela, ResultadoDaAcao, StatusDaAcao } from '@/lib/copilot/tipos'

/**
 * O que o painel do Copilot pede ao servidor fora do chat (o chat é a rota
 * `/api/copilot`, por causa do streaming). Todo export daqui é endpoint: cada
 * um confere a pessoa, o plano e que a conversa/ação é DELA.
 */

async function contextoDoPainel(): Promise<TenantContext> {
  const ctx = await getTenantContext()
  if (ctx.isClient || !ctx.tenantId || !ctx.internalUserId) throw semAcesso()
  if (!copilotNoPlano(ctx) || !copilotConfigurado()) throw semAcesso()
  // No modo suporte o Copilot fica desligado (custo e responsabilidade de quem pede).
  if (ctx.suporte) throw semAcesso()
  return ctx
}

export async function listarConversasDoCopilot(): Promise<ConversaNaLista[]> {
  const ctx = await contextoDoPainel()
  return listarConversas(createAdminClient(), ctx)
}

export async function abrirConversaDoCopilot(id: string): Promise<{ mensagens: MensagemNaTela[] } | { error: string }> {
  const ctx = await contextoDoPainel()
  const admin = createAdminClient()
  if (typeof id !== 'string' || !(await conversaDaPessoa(admin, ctx, id))) return { error: 'Conversa não encontrada.' }
  try {
    return { mensagens: await mensagensParaATela(admin, ctx, id) }
  } catch (e) {
    return { error: mensagemDoErro(e) }
  }
}

export async function apagarConversaDoCopilot(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await contextoDoPainel()
  if (typeof id !== 'string') return { ok: false, error: 'Conversa inválida.' }
  const ok = await apagarConversa(createAdminClient(), ctx, id)
  return ok ? { ok } : { ok, error: 'Conversa não encontrada.' }
}

export async function decidirAcaoDoCopilot(
  acaoId: string,
  decisao: 'confirmar' | 'cancelar',
  pagina: string,
): Promise<{ status: StatusDaAcao; resultado?: ResultadoDaAcao | null; error?: string }> {
  const ctx = await contextoDoPainel()
  if (typeof acaoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(acaoId)) return { status: 'falhou', error: 'Ação inválida.' }
  if (decisao !== 'confirmar' && decisao !== 'cancelar') return { status: 'falhou', error: 'Decisão inválida.' }
  const caminho = typeof pagina === 'string' && pagina.startsWith('/') ? pagina.slice(0, 300) : '/admin'
  const primeiro = caminho.split('?')[0]!.split('/').filter(Boolean)[0] ?? 'admin'
  const r = await decidirAcao({
    ctx, admin: createAdminClient(), pagina: caminho, slugDoPortal: primeiro === 'admin' ? null : primeiro,
  }, acaoId, decisao)
  // A tela por trás do painel mostra o que mudou (a agenda com o agendamento novo).
  if (r.status === 'feita') revalidatePath(caminho.split('?')[0]!)
  return r
}
