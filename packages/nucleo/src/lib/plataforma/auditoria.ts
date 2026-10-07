import { createAdminClient } from '../supabase/admin'
import { gravar } from '../db'
import type { PlatformContext } from './contexto'

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
  | 'equipe.convite_reenviado'
  | 'equipe.desativada'
  | 'equipe.reativada'
  | 'mfa.redefinido'
  | 'sessao.aberta'
  | 'sessao.encerrada'
  | 'chamado.respondido'
  | 'chamado.autorizacao_pedida'
  | 'chamado.nota_interna'
  | 'chamado.assumido'
  | 'chamado.situacao'
  | 'rede.criada'
  | 'rede.editada'
  | 'rede.desligada'
  | 'rede.religada'
  | 'rede.suspensa_automatico'
  | 'rede.reativada_pagamento'
  | 'assinatura.alterada'
  | 'assinatura.plano_aplicado'
  | 'assinatura.adicional'
  | 'assinatura.teste_estendido'
  | 'assinatura.em_dia'
  | 'assinatura.cancelada'
  | 'assinatura.reaberta'
  | 'assinatura.cobranca_ativada'
  | 'assinatura.sincronizada'
  | 'assinatura.contestacao'
  | 'plano.salvo'
  | 'plataforma.configurada'

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
  'equipe.convite_reenviado': 'Reenviou o convite da equipe da plataforma',
  'equipe.desativada':  'Desativou na equipe da plataforma',
  'equipe.reativada':   'Reativou na equipe da plataforma',
  'mfa.redefinido':     'Redefiniu a verificação em duas etapas',
  'sessao.aberta':      'Entrou na conta (modo suporte)',
  'sessao.encerrada':   'Saiu da conta (modo suporte)',
  'chamado.respondido': 'Respondeu o chamado',
  'chamado.autorizacao_pedida': 'Pediu autorização de acesso pelo chamado',
  'chamado.nota_interna': 'Gravou nota interna no chamado',
  'chamado.assumido':   'Assumiu o chamado',
  'chamado.situacao':   'Mudou a situação do chamado',
  'rede.criada':        'Criou a rede',
  'rede.editada':       'Editou os dados da rede',
  'rede.desligada':     'Desligou a rede',
  'rede.religada':      'Religou a rede',
  'rede.suspensa_automatico': 'Rede suspensa por atraso (automático)',
  'rede.reativada_pagamento': 'Rede reativada pelo pagamento (automático)',
  'assinatura.alterada':        'Alterou o plano ou o valor da assinatura',
  'assinatura.plano_aplicado':   'Aplicou a versão atual do plano à rede',
  'assinatura.adicional':        'Mudou um adicional da assinatura (WhatsApp extra, Copilot)',
  'assinatura.teste_estendido': 'Estendeu o período de teste',
  'assinatura.em_dia':          'Marcou a assinatura como em dia',
  'assinatura.cancelada':       'Cancelou a assinatura',
  'assinatura.reaberta':        'Reabriu a assinatura',
  'assinatura.cobranca_ativada': 'Ativou a cobrança no Asaas',
  'assinatura.sincronizada':    'Sincronizou a cobrança com o Asaas',
  'assinatura.contestacao':     'Estorno ou contestação de um pagamento (automático)',
  'plano.salvo':        'Salvou um plano do catálogo',
  'plataforma.configurada': 'Alterou as configurações da plataforma',
}
