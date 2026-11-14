import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TenantContext } from '@estetica-os/types'
import { ler } from '@/lib/db'

/**
 * A correção do registro de um atendimento CONCLUÍDO (bloco Prontuário, PR2b
 * — a revisão do Heitor, 2026-11-13: "a correção guarda a versão de antes").
 *
 * O "Editar registro" trocava a evolução e a ficha, e o de antes sumia. Agora
 * a troca passa por `prontuario_corrigir_registro`, UMA transação: guarda em
 * `prontuario_versoes` o que estava (a evolução, a intercorrência e a ficha do
 * procedimento), com quem corrigiu — o nome do ctx, com a marca "via
 * suporte" — e quando, e só então troca. Sem mudança, nada se grava.
 *
 * Quem chama já conferiu a permissão, a rede e o alcance; a função confere de
 * novo a rede e que o atendimento está concluído.
 */
export interface CamposDaCorrecao {
  notes?:          string | null
  intercurrences?: string | null
  /** A `form_data.ficha` inteira, já retratada no servidor. */
  ficha?:          Record<string, unknown>
}

export async function corrigirRegistro(
  admin: SupabaseClient, ctx: TenantContext, appointmentId: string, campos: CamposDaCorrecao,
): Promise<{ versao: boolean }> {
  const r = await ler(admin.rpc('prontuario_corrigir_registro', {
    p_tenant: ctx.tenantId, p_agendamento: appointmentId, p_campos: campos,
    p_autor: ctx.internalUserId ?? null, p_autor_nome: ctx.userName || ctx.roleLabel || 'Alguém da equipe',
  }), 'corrigir o registro do atendimento') as { versao?: boolean } | null
  return { versao: !!r?.versao }
}
