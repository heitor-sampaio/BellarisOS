import 'server-only'
import { isOwnScope } from '@/lib/auth'
import type { AppModule, TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

/**
 * "A cliente DELA": a que tem um agendamento com a profissional — qualquer um,
 * inclusive futuro (decisão do Heitor, 2026-10-29: marcar a cliente com ela já
 * abre o que é da cliente). É a regra do prontuário "só os meus"
 * (`recusaDoAnexo`, `lib/injetaveis/alcance.ts`), dos planos com a agenda
 * "só os meus" e dos documentos emitidos.
 *
 * "A cliente é da clínica; o atendimento é da profissional": o que é DA
 * CLIENTE (prontuário, planos, documentos) segue quem a atende, quem quer que
 * o tenha feito.
 */
export async function clienteAtendidaPor(admin: Admin, profissionalId: string, clientId: string): Promise<boolean> {
  const meu = await ler(admin.from('appointments').select('id')
    .eq('client_id', clientId).eq('professional_id', profissionalId).limit(1), 'conferir se a cliente é atendida por você')
  return (meu ?? []).length > 0
}

/**
 * Com o módulo em "só os meus", a cliente é dela? Sem o OWN, toda cliente.
 * Sem membro interno (não deveria acontecer com o OWN), nenhuma.
 */
export async function clienteNoEscopo(admin: Admin, ctx: TenantContext, modulo: AppModule, clientId: string): Promise<boolean> {
  if (!isOwnScope(ctx, modulo)) return true
  if (!ctx.internalUserId) return false
  return clienteAtendidaPor(admin, ctx.internalUserId, clientId)
}
