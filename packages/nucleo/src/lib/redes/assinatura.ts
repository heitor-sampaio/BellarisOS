import 'server-only'
import { createAdminClient } from '../supabase/admin'
import { gravar, ler } from '../db'
import { tagDaRede } from './cache'
import { avisarQuemAdministraARede } from '../suporte/avisos'
import { rotuloDaSituacao } from './situacao'

/**
 * A ASSINATURA de uma rede — a LEITURA (a clínica e a plataforma) e o que vem
 * depois de a situação mudar. O que fala com o Asaas mora em
 * `lib/redes/cobranca.ts`, que só a administração do sistema carrega: a
 * clínica não tem a chave nem o código da cobrança.
 *
 * Quem escreve a situação (`tenants.plan_status`) é a cobrança:
 *  - `assinatura_aplicar_cobranca` (banco) — cada cobrança do Asaas, recalculando
 *    a situação POR ESTADO (eventos chegam fora de ordem e repetidos);
 *  - `assinaturas_aplicar_regras` (banco, cron) — teste vencido e carência.
 * Depois de cada mudança, `depoisDaMudanca` expira o cache da rede (o portão
 * vale na próxima tela), avisa quem administra a rede e registra.
 */
export type Expirar = (tag: string) => void

export interface AssinaturaLida {
  rede: {
    id: string; nome: string; documento: string | null; email: string; telefone: string | null
    ativa: boolean; desligadaMotivo: string | null; planStatus: string | null; planName: string | null
    trialEndsAt: string | null; emAtrasoDesde: string | null; createdAt: string
  }
  assinatura: {
    planoId: string | null; valorCentavos: number; cobranca: 'sem_cobranca' | 'ativa' | 'cancelada'
    asaasCustomerId: string | null; asaasSubscriptionId: string | null; proximoVencimento: string | null
  } | null
  faturas: {
    id: string; valorCentavos: number; vencimento: string; situacao: string; pagoEm: string | null
    url: string | null; removida: boolean
  }[]
}

export async function lerAssinatura(tenantId: string): Promise<AssinaturaLida | null> {
  const admin = createAdminClient()
  const [t, s, f] = await Promise.all([
    ler(admin.from('tenants')
      .select('id, name, document, email, phone, is_active, desligada_motivo, plan_status, plan_name, trial_ends_at, em_atraso_desde, created_at')
      .eq('id', tenantId).maybeSingle(), 'buscar a rede'),
    ler(admin.from('tenant_subscriptions')
      .select('plan_id, valor_centavos, cobranca, asaas_customer_id, asaas_subscription_id, proximo_vencimento')
      .eq('tenant_id', tenantId).maybeSingle(), 'buscar a assinatura'),
    ler(admin.from('subscription_invoices')
      .select('id, valor_centavos, vencimento, situacao, pago_em, invoice_url, removida')
      .eq('tenant_id', tenantId).order('vencimento', { ascending: false }).limit(24), 'buscar as faturas'),
  ])
  if (!t) return null
  return {
    rede: {
      id: t.id, nome: t.name, documento: t.document, email: t.email, telefone: t.phone,
      ativa: t.is_active !== false, desligadaMotivo: t.desligada_motivo, planStatus: t.plan_status,
      planName: t.plan_name, trialEndsAt: t.trial_ends_at, emAtrasoDesde: t.em_atraso_desde, createdAt: t.created_at,
    },
    assinatura: s ? {
      planoId: s.plan_id, valorCentavos: s.valor_centavos, cobranca: s.cobranca,
      asaasCustomerId: s.asaas_customer_id, asaasSubscriptionId: s.asaas_subscription_id,
      proximoVencimento: s.proximo_vencimento,
    } : null,
    faturas: ((f ?? []) as { id: string; valor_centavos: number; vencimento: string; situacao: string; pago_em: string | null; invoice_url: string | null; removida: boolean }[])
      .map(x => ({ id: x.id, valorCentavos: x.valor_centavos, vencimento: x.vencimento, situacao: x.situacao,
        pagoEm: x.pago_em, url: x.invoice_url, removida: x.removida })),
  }
}

/** A fatura em aberto mais antiga, com link — o "Pagar" da clínica. */
export function faturaEmAberto(a: AssinaturaLida | null): AssinaturaLida['faturas'][number] | null {
  const abertas = (a?.faturas ?? []).filter(f => !f.removida && (f.situacao === 'PENDING' || f.situacao === 'OVERDUE'))
  return abertas.sort((x, y) => x.vencimento.localeCompare(y.vencimento))[0] ?? null
}

/** Registro automático (sem pessoa da plataforma): pagamento, regra do cron. */
export async function registrarAutomatico(kind: string, tenantId: string, dados: Record<string, unknown>) {
  await gravar(createAdminClient().from('platform_audit_log').insert({ staff_id: null, tenant_id: tenantId, kind, dados }),
    'registrar a mudança automática da assinatura')
}

/**
 * O que vem DEPOIS de a situação mudar: o cache da rede expira (o portão
 * barra ou libera já na próxima tela), quem administra a rede é avisado, e as
 * mudanças automáticas ficam registradas. Acessório: falhar aqui não desfaz a
 * mudança, que já está gravada.
 */
export async function depoisDaMudanca(tenantId: string, de: string | null, para: string, origem: 'pagamento' | 'regra' | 'admin', expirar: Expirar) {
  if (de === para) return
  try { expirar(tagDaRede(tenantId)) } catch (e) { console.error('[assinatura] cache da rede:', (e as Error).message) }
  try {
    if (origem !== 'admin') {
      const kind = para === 'suspended' ? 'rede.suspensa_automatico'
        : para === 'active' ? 'rede.reativada_pagamento' : 'assinatura.alterada'
      await registrarAutomatico(kind, tenantId, { de, para, origem })
    }
    const aviso = para === 'past_due'
      ? { title: 'Assinatura do BellarisOS em atraso', body: 'Há uma fatura em aberto. Regularize para não ter o acesso suspenso.' }
      : para === 'suspended'
        ? { title: 'Acesso ao BellarisOS suspenso', body: 'A assinatura ficou em atraso além do prazo. Pague a fatura em aberto para voltar.' }
        : para === 'active' && (de === 'past_due' || de === 'suspended')
          ? { title: 'Pagamento recebido', body: 'A assinatura do BellarisOS está em dia. Obrigado!' }
          : null
    if (aviso) await avisarQuemAdministraARede(tenantId, aviso)
  } catch (e) {
    console.error('[assinatura] depois da mudança:', (e as Error).message, rotuloDaSituacao(para))
  }
}
