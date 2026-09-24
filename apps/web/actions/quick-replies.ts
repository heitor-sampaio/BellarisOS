'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * Respostas rápidas: os textos que o atendimento repete o dia inteiro.
 *
 * Não confundir com `message_templates`: template é HSM, passa pela aprovação
 * da Meta e existe para furar a janela de 24h. Resposta rápida é texto comum,
 * vale em qualquer canal e é só um atalho de digitação.
 */

export interface QuickReply {
  id:         string
  title:      string
  content:    string
  created_at: string
}

export interface QuickReplyInput {
  id?:     string
  title:   string
  content: string
}

const LIMITE_TITULO   = 60
const LIMITE_CONTEUDO = 4000

export async function listQuickReplies(): Promise<QuickReply[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')

  const { data, error } = await createAdminClient()
    .from('quick_replies')
    .select('id, title, content, created_at')
    .eq('tenant_id', ctx.tenantId!)
    .order('title')

  // Erro descartado aqui faria a lista aparecer vazia e a pessoa recriar tudo.
  if (error) throw new Error(`Falha ao carregar as respostas rápidas: ${error.message}`)
  return (data ?? []) as QuickReply[]
}

export async function saveQuickReply(
  input: QuickReplyInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const title   = input.title?.trim()   ?? ''
  const content = input.content?.trim() ?? ''

  if (!title)   return { ok: false, error: 'Dê um nome ao atalho.' }
  if (!content) return { ok: false, error: 'Escreva o texto da resposta.' }
  if (title.length > LIMITE_TITULO) {
    return { ok: false, error: `O nome passa de ${LIMITE_TITULO} caracteres.` }
  }
  if (content.length > LIMITE_CONTEUDO) {
    return { ok: false, error: `O texto passa de ${LIMITE_CONTEUDO} caracteres.` }
  }

  const agora = new Date().toISOString()

  if (input.id) {
    const { error } = await admin
      .from('quick_replies')
      .update({ title, content, updated_at: agora })
      .eq('id', input.id)
      .eq('tenant_id', ctx.tenantId!)

    if (error) return { ok: false, error: traduzir(error) }
    revalidarInbox()
    return { ok: true, id: input.id }
  }

  const { data, error } = await admin
    .from('quick_replies')
    .insert({ tenant_id: ctx.tenantId!, title, content, created_by: await membroId(ctx) })
    .select('id')
    .single()

  if (error) return { ok: false, error: traduzir(error) }
  revalidarInbox()
  return { ok: true, id: (data as { id: string }).id }
}

export async function deleteQuickReply(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')

  const { error } = await createAdminClient()
    .from('quick_replies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)

  if (error) return { ok: false, error: error.message }
  revalidarInbox()
  return { ok: true }
}

// -- auxiliares ---------------------------------------------------------------

function traduzir(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'Já existe um atalho com esse nome.'
  return error.message
}

async function membroId(ctx: Awaited<ReturnType<typeof getTenantContext>>): Promise<string | null> {
  if (ctx.internalUserId) return ctx.internalUserId
  const data = await ler(createAdminClient()
    .from('users').select('id').eq('auth_id', ctx.userId).maybeSingle(), 'buscar o usuário')
  return (data as { id: string } | null)?.id ?? null
}

function revalidarInbox() {
  revalidatePath('/admin/inbox')
  revalidatePath('/[slug]/inbox', 'page')
}
