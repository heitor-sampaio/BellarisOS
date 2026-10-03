import { createAdminClient } from '@/lib/supabase/admin'
import { gravar } from '@/lib/db'
import type { PlatformContext } from '@/lib/plataforma/contexto'

/**
 * O que a plataforma fez, e onde — `platform_audit_log`, que só acrescenta.
 *
 * É o registro que a clínica vê em Configurações → Suporte ("o suporte abriu
 * o painel da sua rede", "reenviou o acesso da Ana") e o que responde "quem
 * fez isto" dentro da plataforma. `dados` nunca leva segredo.
 */
export type TipoDeRegistroDaPlataforma =
  | 'rede.visualizada'
  | 'acesso.reenviado'
  | 'membro.reativado'
  | 'plano.alterado'
  | 'equipe.criada'
  | 'equipe.desativada'
  | 'equipe.reativada'
  | 'mfa.redefinido'
  | 'sessao.aberta'
  | 'sessao.encerrada'
  | 'chamado.respondido'
  | 'chamado.autorizacao_pedida'

export async function registrarNaPlataforma(
  ctx: Pick<PlatformContext, 'staffId'>,
  kind: TipoDeRegistroDaPlataforma,
  alvo: { tenantId?: string | null; targetUserId?: string | null; dados?: Record<string, unknown> } = {},
): Promise<void> {
  await gravar(createAdminClient().from('platform_audit_log').insert({
    staff_id:       ctx.staffId,
    tenant_id:      alvo.tenantId ?? null,
    kind,
    target_user_id: alvo.targetUserId ?? null,
    dados:          alvo.dados ?? {},
  }), 'registrar a ação da plataforma')
}

/**
 * "O suporte abriu o painel da sua rede" — uma vez a cada meia hora por
 * pessoa, para o registro dizer quem olhou sem virar um por clique.
 */
export async function registrarVisitaDaRede(ctx: Pick<PlatformContext, 'staffId'>, tenantId: string): Promise<void> {
  const meiaHora = new Date(Date.now() - 30 * 60_000).toISOString()
  const { data, error } = await createAdminClient().from('platform_audit_log').select('id')
    .eq('tenant_id', tenantId).eq('staff_id', ctx.staffId).eq('kind', 'rede.visualizada')
    .gte('at', meiaHora).limit(1)
  if (error) throw new Error(`Não consegui conferir o registro de visita: ${error.message}`)
  if (!(data ?? []).length) await registrarNaPlataforma(ctx, 'rede.visualizada', { tenantId })
}

/** Rótulos para a tela (o painel e a aba Suporte da clínica). */
export const ROTULO_DO_REGISTRO: Record<TipoDeRegistroDaPlataforma, string> = {
  'rede.visualizada':   'Abriu o painel da rede',
  'acesso.reenviado':   'Reenviou o acesso',
  'membro.reativado':   'Reativou o membro',
  'plano.alterado':     'Alterou o plano',
  'equipe.criada':      'Cadastrou na equipe da plataforma',
  'equipe.desativada':  'Desativou na equipe da plataforma',
  'equipe.reativada':   'Reativou na equipe da plataforma',
  'mfa.redefinido':     'Redefiniu a verificação em duas etapas',
  'sessao.aberta':      'Entrou na conta (modo suporte)',
  'sessao.encerrada':   'Saiu da conta (modo suporte)',
  'chamado.respondido': 'Respondeu o chamado',
  'chamado.autorizacao_pedida': 'Pediu autorização de acesso pelo chamado',
}
