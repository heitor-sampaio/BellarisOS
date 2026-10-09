import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { can, ownerFilter, temRecurso } from '@/lib/auth'
import { ler } from '@/lib/db'
import {
  lerVisibilidade, lerCaixas, passaNasCaixas, passaNoAlcanceDoDono,
  type AlcanceDoDono,
} from '@/lib/inbox/visibilidade'

/**
 * O alcance do inbox: o que cada pessoa pode ver e tocar.
 *
 * São duas regras, e as duas valem juntas:
 *
 * - **o dono** — com CRM "só os meus", pela pessoa ou pela conversa (escolha da
 *   rede, `tenants.inbox_visibilidade`);
 * - **as caixas** — escolha do cargo (`tenant_roles.inbox_caixas`).
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
 * Regra do dono já lida do banco, ou `null` se o cargo vê tudo no CRM.
 *
 * Erro de leitura LANÇA: quem chama decide, e decidir "mostra tudo" aqui seria
 * vazar em silêncio.
 */
export async function alcanceDoDono(admin: Admin, ctx: TenantContext): Promise<AlcanceDoDono | null> {
  const owner = ownerFilter(ctx, 'crm')
  if (!owner) return null
  const tenantId = ctx.tenantId!

  const rede = await ler(
    admin.from('tenants').select('inbox_visibilidade').eq('id', tenantId).maybeSingle(),
    'ler a visibilidade do inbox',
  )
  const modo = lerVisibilidade((rede as { inbox_visibilidade?: string } | null)?.inbox_visibilidade)

  if (modo === 'conversa') {
    // Num array só, pelo banco: o select direto parava em 1000 linhas (o teto
    // do PostgREST), e as conversas dos leads além disso sumiam sem aviso.
    const meus = await ler(
      admin.rpc('leads_do_dono', { p_tenant: tenantId, p_owner: owner }),
      'carregar os leads do responsável',
    )
    return { modo, meusLeads: (meus ?? []) as string[] }
  }

  // No banco, e num array só: ler os leads com dono para contar aqui bateria
  // no teto de 1000 linhas do PostgREST (§13.1), e a pessoa de outro SDR
  // voltaria a aparecer sem nada acusar.
  const ocultas = await ler(
    admin.rpc('contatos_ocultos_do_dono', { p_tenant: tenantId, p_owner: owner }),
    'calcular quem é de outro responsável',
  )
  return { modo, ocultas: (ocultas ?? []) as string[] }
}

/**
 * As caixas de WhatsApp que a pessoa enxerga, ou `null` para todas.
 *
 * Com "só as da pessoa", são os números a que ela está ligada em
 * `whatsapp_number_users` — e nenhum, se não estiver ligada a nenhum. Erro de
 * leitura LANÇA, pelo mesmo motivo de `alcanceDoDono`.
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
        .select('lead_id, contato_id, whatsapp_number_id')
        .eq('id', conversationId).eq('tenant_id', ctx.tenantId!).maybeSingle(),
      'conferir a conversa',
    ) as { lead_id: string | null; contato_id: string | null; whatsapp_number_id: string | null } | null
    if (!conv) return false

    const [dono, caixas] = await Promise.all([alcanceDoDono(admin, ctx), caixasDoAlcance(admin, ctx)])
    return passaNoAlcanceDoDono(conv, dono) && passaNasCaixas(conv.whatsapp_number_id, caixas)
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
