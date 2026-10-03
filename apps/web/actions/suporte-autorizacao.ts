'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { getTenantContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, mensagemDoErro } from '@/lib/db'
import { podeAutorizar, podeIncluirClinico, horasValidas, HORAS_PADRAO } from '@/lib/suporte/regras'
import { tagDaSessao } from '@/lib/suporte/sessao'

/**
 * A CLÍNICA autorizando (e revogando) o suporte do BellarisOS a entrar na
 * conta de um membro.
 *
 * Quem autoriza quem é a regra de `lib/suporte/regras.ts` (o próprio membro,
 * para si; quem é da rede com `settings: MANAGE`, para qualquer um). Dado
 * clínico só entra se quem autoriza tem prontuário MANAGE. A própria sessão de
 * suporte não autoriza nada — nem a si mesma.
 */
type Resultado = { ok: true } | { ok: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function autorizarSuporte(pedido: {
  userId: string; horas?: number; incluiClinico?: boolean; chamadoId?: string | null
}): Promise<Resultado> {
  const ctx = await getTenantContext()
  if (ctx.suporte) return { ok: false, error: 'A sessão de suporte não autoriza acesso.' }
  if (!ctx.tenantId || !UUID.test(pedido?.userId ?? '')) return { ok: false, error: 'Pedido inválido.' }
  if (!podeAutorizar(ctx, pedido.userId)) return { ok: false, error: 'Você só pode autorizar o acesso à sua própria conta.' }
  const horas = pedido.horas ?? HORAS_PADRAO
  if (!horasValidas(horas)) return { ok: false, error: 'Duração inválida.' }
  const clinico = !!pedido.incluiClinico
  if (clinico && !podeIncluirClinico(ctx)) return { ok: false, error: 'Só quem gerencia o prontuário libera dado clínico ao suporte.' }
  const chamadoId = pedido.chamadoId && UUID.test(pedido.chamadoId) ? pedido.chamadoId : null
  try {
    const { error } = await createAdminClient().rpc('suporte_autorizar', {
      p_tenant: ctx.tenantId, p_target: pedido.userId, p_por: ctx.internalUserId,
      p_via: chamadoId ? 'chamado' : 'configuracoes', p_ticket: chamadoId, p_clinico: clinico, p_horas: horas,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/settings')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

export async function revogarAutorizacaoDeSuporte(grantId: string): Promise<Resultado> {
  const ctx = await getTenantContext()
  if (ctx.suporte) return { ok: false, error: 'A sessão de suporte não revoga acesso.' }
  if (!ctx.tenantId || !UUID.test(grantId ?? '')) return { ok: false, error: 'Pedido inválido.' }
  try {
    const admin = createAdminClient()
    const grant = await ler(admin.from('support_grants').select('id, target_user_id')
      .eq('id', grantId).eq('tenant_id', ctx.tenantId).is('revoked_at', null).maybeSingle(), 'buscar a autorização') as
      { id: string; target_user_id: string } | null
    if (!grant) return { ok: false, error: 'Autorização não encontrada.' }
    if (!podeAutorizar(ctx, grant.target_user_id)) return { ok: false, error: 'Você não pode revogar esta autorização.' }
    const { data, error } = await admin.rpc('suporte_revogar_autorizacao', {
      p_grant: grantId, p_tenant: ctx.tenantId, p_por_user: ctx.internalUserId, p_por_staff: null, p_motivo: 'revogada pela clínica',
    })
    if (error) return { ok: false, error: error.message }
    // A sessão em curso cai na próxima requisição do atendente.
    for (const s of (data ?? []) as string[]) updateTag(tagDaSessao(s))
    revalidatePath('/admin/settings')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}

/** O que o suporte fez numa sessão — para o histórico da aba Suporte. */
export async function oQueFoiFeitoNaSessao(sessaoId: string): Promise<
  { ok: true; acessos: { at: string; method: string | null; path: string | null; acao: string | null }[];
    eventos: { nome: string; em: string }[] } | { ok: false; error: string }
> {
  const ctx = await getTenantContext()
  if (ctx.suporte) return { ok: false, error: 'Indisponível no modo suporte.' }
  if (!ctx.tenantId || ctx.branchId !== null || ctx.permissions.settings !== 'MANAGE') return { ok: false, error: 'Sem acesso.' }
  if (!UUID.test(sessaoId ?? '')) return { ok: false, error: 'Pedido inválido.' }
  try {
    const admin = createAdminClient()
    const sessao = await ler(admin.from('support_sessions').select('id').eq('id', sessaoId).eq('tenant_id', ctx.tenantId).maybeSingle(),
      'buscar a sessão de suporte')
    if (!sessao) return { ok: false, error: 'Sessão não encontrada.' }
    const [acessos, eventos] = await Promise.all([
      ler(admin.from('support_access_log').select('at, method, path, action_id').eq('session_id', sessaoId)
        .order('at').limit(500), 'carregar os acessos'),
      ler(admin.from('domain_events').select('nome, ocorrido_em').eq('suporte_sessao_id', sessaoId)
        .eq('tenant_id', ctx.tenantId).order('ocorrido_em').limit(200), 'carregar os eventos da sessão'),
    ])
    return {
      ok: true,
      acessos: ((acessos ?? []) as { at: string; method: string | null; path: string | null; action_id: string | null }[])
        .map(a => ({ at: a.at, method: a.method, path: a.path, acao: a.action_id })),
      eventos: ((eventos ?? []) as { nome: string; ocorrido_em: string }[]).map(e => ({ nome: e.nome, em: e.ocorrido_em })),
    }
  } catch (e) {
    return { ok: false, error: mensagemDoErro(e) }
  }
}
