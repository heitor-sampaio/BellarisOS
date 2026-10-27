import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/auth'
import { ler, contar, tentar } from '@/lib/db'

/**
 * Quem abriu o prontuário (2026-10-27, decisões do Heitor).
 *
 * Toda leitura CLÍNICA registra quem, quando e por onde
 * (`prontuario_acessos`): a ficha da cliente (com os anexos clínicos), a sessão
 * de atendimento, o plano com a anotação ou a anamnese, e a liberação do
 * prontuário no pacote LGPD. A mesma pessoa relendo a mesma cliente no mesmo
 * ponto em 30 min é uma linha só (a função do banco junta).
 *
 * Registra-se DEPOIS de decidir que o dado clínico vai à tela — com o mesmo
 * `podeVerClinico`/`canViewRecords` da tela —, nunca só por abrir a página.
 * Falha no registro vai ao log e não tranca o atendimento.
 */
export type PontoDoProntuario = 'ficha' | 'sessao' | 'plano' | 'lgpd'

export const ROTULO_DO_PONTO: Record<PontoDoProntuario, string> = {
  ficha:  'Ficha da cliente',
  sessao: 'Sessão de atendimento',
  plano:  'Plano de tratamento',
  lgpd:   'Liberou no pacote LGPD',
}

export async function registrarAcessoAoProntuario(
  ctx: TenantContext, clienteId: string, ponto: PontoDoProntuario, referencia?: string | null,
): Promise<void> {
  if (!ctx.tenantId || !clienteId) return
  await tentar(createAdminClient().rpc('prontuario_registrar_acesso', {
    p_tenant: ctx.tenantId, p_cliente: clienteId, p_usuario: ctx.internalUserId ?? null,
    // O nome do ctx: leva a marca "via suporte" (CLAUDE.md §14).
    p_nome: ctx.userName, p_ponto: ponto, p_referencia: referencia ?? null,
  }), 'registrar o acesso ao prontuário')
}

/** Quem vê o registro: o admin da REDE — da rede e com o prontuário em gestão. */
export function podeVerAcessosAoProntuario(ctx: TenantContext): boolean {
  return ctx.branchId === null && can(ctx, 'medical_records', 'MANAGE')
}

/** Como a ficha mostra: `onde` já é o rótulo do ponto. */
export interface AcessoAoProntuario { id: string; quem: string; onde: string; em: string }

/** Os mais recentes primeiro. */
export const ACESSOS_NA_TELA = 100

/** Os acessos da cliente, para quem pode vê-los (senão, nulo). */
export async function acessosAoProntuario(
  ctx: TenantContext, clienteId: string,
): Promise<{ itens: AcessoAoProntuario[]; total: number } | null> {
  if (!podeVerAcessosAoProntuario(ctx)) return null
  const admin = createAdminClient()
  const [linhas, total] = await Promise.all([
    ler(admin.from('prontuario_acessos').select('id, ator_nome, ponto, acessado_em')
      .eq('tenant_id', ctx.tenantId!).eq('client_id', clienteId)
      .order('acessado_em', { ascending: false }).order('id').limit(ACESSOS_NA_TELA), 'carregar os acessos ao prontuário'),
    contar(admin.from('prontuario_acessos').select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId!).eq('client_id', clienteId), 'contar os acessos ao prontuário'),
  ])
  return {
    total,
    itens: ((linhas ?? []) as { id: string; ator_nome: string; ponto: PontoDoProntuario; acessado_em: string }[])
      .map(l => ({ id: l.id, quem: l.ator_nome, onde: ROTULO_DO_PONTO[l.ponto] ?? l.ponto, em: l.acessado_em })),
  }
}
