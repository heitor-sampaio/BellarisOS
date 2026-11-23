import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { can, temRecurso } from '@/lib/auth'
import { ler } from '@/lib/db'
import { lerCaixas, passaNasCaixas } from '@/lib/inbox/visibilidade'

/**
 * O alcance do inbox: o que cada pessoa pode ver e tocar.
 *
 * Quem tem o CRM em Ver vê as conversas da rede, menos as das caixas de
 * WhatsApp que o cargo não enxerga (`tenant_roles.inbox_caixas`).
 *
 * Mora aqui, e não em `actions/inbox.ts`, porque todo export de um arquivo
 * `'use server'` vira endpoint público: um `conversaAoAlcance` exportado de lá
 * responderia "existe e você não pode ver" para qualquer id. E `getContactEvents`,
 * em outro arquivo de actions, precisa da mesma regra.
 *
 * ⚠️ Até 2026-09-27 as regras filtravam só a LISTA. Abrir uma conversa pelo id
 * — ler as mensagens, responder, marcar como lida — não conferia nada além da
 * rede: esconder da lista era esconder a porta, não trancá-la. Toda action que
 * recebe o id de uma conversa (ou de uma mensagem) passa por `conversaAoAlcance`.
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * As caixas de WhatsApp que a pessoa enxerga, ou `null` para todas.
 *
 * Com "só as da pessoa", são os números a que ela está ligada em
 * `whatsapp_number_users` — e nenhum, se não estiver ligada a nenhum. Erro de
 * leitura LANÇA: quem chama decide, e decidir "mostra tudo" aqui seria vazar em
 * silêncio.
 */
export async function caixasDoAlcance(admin: Admin, ctx: TenantContext): Promise<string[] | null> {
  // Quem não tem cargo editável (admin da rede, cargo de sistema) vê tudo, como
  // em todo o resto da matriz.
  if (ctx.isNetworkAdmin || !ctx.roleId) return null

  const cargo = await ler(
    admin.from('tenant_roles').select('inbox_caixas, is_system')
      .eq('id', ctx.roleId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
    'ler as caixas que o cargo enxerga',
  ) as { inbox_caixas?: string; is_system?: boolean } | null
  if (!cargo || cargo.is_system || lerCaixas(cargo.inbox_caixas) === 'todas') return null

  if (!ctx.internalUserId) return []
  const vinculos = await ler(
    admin.from('whatsapp_number_users').select('whatsapp_number_id')
      .eq('tenant_id', ctx.tenantId!).eq('user_id', ctx.internalUserId),
    'ler os números da pessoa',
  )
  return ((vinculos ?? []) as { whatsapp_number_id: string }[]).map(v => v.whatsapp_number_id)
}

/**
 * Esta pessoa pode abrir esta conversa?
 *
 * `false` para conversa de outra rede, inexistente, fora do alcance — e para
 * erro de leitura: sem saber, não se abre. Quem chama responde como se a
 * conversa não existisse, para a resposta não confirmar que ela existe.
 */
export async function conversaAoAlcance(
  admin: Admin,
  ctx: TenantContext,
  conversationId: string,
): Promise<boolean> {
  // O inbox é do CRM. Sem ele, nenhuma conversa — é o caso de quem cadastra
  // cliente ou marca horário e mandaria um id de conversa junto.
  if (!can(ctx, 'crm', 'VIEW')) return false
  // A inbox é uma funcionalidade do PLANO (lib/planos/recursos.ts).
  if (!temRecurso(ctx, 'inbox')) return false
  try {
    const conv = await ler(
      admin.from('conversations')
        .select('whatsapp_number_id')
        .eq('id', conversationId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'conferir a conversa',
    ) as { whatsapp_number_id: string | null } | null
    if (!conv) return false

    const caixas = await caixasDoAlcance(admin, ctx)
    return passaNasCaixas(conv.whatsapp_number_id, caixas)
  } catch (e) {
    console.error('[conversaAoAlcance]', e instanceof Error ? e.message : e)
    return false
  }
}

/** Mesma pergunta a partir de uma mensagem: vale o alcance da conversa dela. */
export async function mensagemAoAlcance(
  admin: Admin,
  ctx: TenantContext,
  messageId: string,
): Promise<boolean> {
  const { data, error } = await admin.from('messages')
    .select('conversation_id').eq('id', messageId).eq('tenant_id', ctx.tenantId!).maybeSingle()
  if (error) { console.error('[mensagemAoAlcance]', error.message); return false }
  const conversa = (data as { conversation_id: string | null } | null)?.conversation_id
  return !!conversa && conversaAoAlcance(admin, ctx, conversa)
}
