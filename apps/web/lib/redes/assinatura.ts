import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler, tentar } from '@/lib/db'
import { tagDaRede } from '@/lib/cached-queries'
import { avisarQuemAdministraARede } from '@/lib/suporte/avisos'
import {
  garantirCliente, criarAssinatura, atualizarValorDaAssinatura, removerAssinatura, cobrancasDaAssinatura, atualizarCliente,
  type CobrancaDoAsaas,
} from '@/lib/asaas/cliente'
import { rotuloDaSituacao } from '@/lib/redes/situacao'

/**
 * A ASSINATURA de uma rede — o miolo que o /sistema (ações do admin), o
 * webhook do Asaas e o cron usam. Fora de `'use server'`: quem chama confere
 * quem é.
 *
 * Quem escreve a situação (`tenants.plan_status`) é a cobrança:
 *  - `assinatura_aplicar_cobranca` (banco) — cada cobrança do Asaas, recalculando
 *    a situação POR ESTADO (eventos chegam fora de ordem e repetidos);
 *  - `assinaturas_aplicar_regras` (banco, cron) — teste vencido e carência.
 * Depois de cada mudança, `depoisDaMudanca` expira o cache da rede (o portão
 * vale na próxima tela), avisa quem administra a rede e registra.
 */
type Expirar = (tag: string) => void

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

const descricaoDaAssinatura = (planoNome: string | null) => `BellarisOS${planoNome ? ` — plano ${planoNome}` : ''}`

/** Registro automático (sem pessoa da plataforma): pagamento, regra do cron. */
async function registrarAutomatico(kind: string, tenantId: string, dados: Record<string, unknown>) {
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

/** Estorno e contestação: o dinheiro voltou depois de pago — a plataforma precisa saber. */
const EVENTOS_DE_CONTESTACAO = new Set([
  'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL', 'PAYMENT_RECEIVED_IN_CASH_UNDONE',
])

/** Aplica uma cobrança do Asaas (webhook ou reconciliação). */
export async function aplicarCobranca(cobranca: CobrancaDoAsaas | Record<string, unknown>, evento: string, expirar: Expirar) {
  const r = await gravar(createAdminClient().rpc('assinatura_aplicar_cobranca', { p_payment: cobranca, p_evento: evento }),
    'aplicar a cobrança') as { tenant_id?: string; antes?: string; depois?: string; ignorado?: string } | null
  if (r?.tenant_id && r.depois) await depoisDaMudanca(r.tenant_id, r.antes ?? null, r.depois, 'pagamento', expirar)
  // Estorno/contestação: fica no registro da rede e na auditoria do /sistema
  // (a situação não muda sozinha — quem decide é o admin).
  if (r?.tenant_id && EVENTOS_DE_CONTESTACAO.has(evento)) {
    try {
      await registrarAutomatico('assinatura.contestacao', r.tenant_id, {
        evento, cobranca: (cobranca as { id?: string }).id ?? null, valor: (cobranca as { value?: number }).value ?? null,
      })
    } catch (e) { console.error('[assinatura] registro da contestação:', (e as Error).message) }
  }
  return r
}

/**
 * Liga a cobrança no Asaas: o cliente (procurado antes de criar) e a
 * assinatura mensal, com o valor RETRATADO na rede e o primeiro vencimento
 * escolhido (o fim do teste, em geral).
 */
export async function ativarCobranca(tenantId: string, primeiroVencimento: string): Promise<void> {
  const a = await lerAssinatura(tenantId)
  if (!a) throw new Error('Rede não encontrada.')
  if (!a.assinatura) throw new Error('Defina o plano da rede antes de ativar a cobrança.')
  if (a.assinatura.cobranca === 'ativa' && a.assinatura.asaasSubscriptionId) throw new Error('A cobrança já está ativa.')
  if (a.assinatura.valorCentavos <= 0) throw new Error('A assinatura está com valor zero.')
  const admin = createAdminClient()
  // TRAVA: dois cliques (ou duas abas) não criam duas assinaturas — cobraria
  // em dobro. Quem marca `ativando_em` primeiro leva; a marca vence em 2 min
  // (uma tentativa que caiu no meio não trava para sempre).
  const doisMinutos = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data: trava, error: eTrava } = await admin.from('tenant_subscriptions')
    .update({ ativando_em: new Date().toISOString() })
    .eq('tenant_id', tenantId).neq('cobranca', 'ativa')
    .or(`ativando_em.is.null,ativando_em.lt.${doisMinutos}`)
    .select('tenant_id')
  if (eTrava) throw new Error(`Não consegui reservar a ativação: ${eTrava.message}`)
  if (!trava?.length) throw new Error('A cobrança já está sendo ligada (ou já está ativa).')
  try {
    await ligarNoAsaas(tenantId, a, primeiroVencimento)
  } finally {
    await tentar(admin.from('tenant_subscriptions').update({ ativando_em: null }).eq('tenant_id', tenantId), 'soltar a trava da ativação')
  }
}

async function ligarNoAsaas(tenantId: string, a: AssinaturaLida, primeiroVencimento: string): Promise<void> {
  if (!a.assinatura) return
  const admin = createAdminClient()
  const plano = a.assinatura.planoId
    ? await ler(admin.from('platform_plans').select('nome').eq('id', a.assinatura.planoId).maybeSingle(), 'ler o plano') as { nome: string } | null
    : null
  const cliente = a.assinatura.asaasCustomerId ?? await garantirCliente({
    id: a.rede.id, nome: a.rede.nome, documento: a.rede.documento, email: a.rede.email, telefone: a.rede.telefone,
  })
  // O id do cliente fica gravado já: se a assinatura falhar, a próxima
  // tentativa não cria outro cliente.
  await gravar(admin.from('tenant_subscriptions').update({ asaas_customer_id: cliente, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId).select('tenant_id').single(), 'guardar o cliente do Asaas')
  const sub = await criarAssinatura({
    cliente, valorCentavos: a.assinatura.valorCentavos, vencimento: primeiroVencimento,
    descricao: descricaoDaAssinatura(plano?.nome ?? null), redeId: tenantId,
  })
  await gravar(admin.from('tenant_subscriptions').update({
    asaas_subscription_id: sub.id, cobranca: 'ativa', cancelada_em: null, proximo_vencimento: primeiroVencimento,
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).select('tenant_id').single(), 'guardar a assinatura do Asaas')
}

/** Leva ao Asaas o valor novo da assinatura (quando a cobrança está ligada). */
export async function levarValorAoAsaas(tenantId: string): Promise<void> {
  const a = await lerAssinatura(tenantId)
  if (!a?.assinatura?.asaasSubscriptionId || a.assinatura.cobranca !== 'ativa') return
  const plano = a.assinatura.planoId
    ? await ler(createAdminClient().from('platform_plans').select('nome').eq('id', a.assinatura.planoId).maybeSingle(), 'ler o plano') as { nome: string } | null
    : null
  await atualizarValorDaAssinatura(a.assinatura.asaasSubscriptionId, a.assinatura.valorCentavos, descricaoDaAssinatura(plano?.nome ?? null))
}

/** A assinatura foi encerrada/inativada NO Asaas (pelo painel de lá). */
export async function assinaturaEncerradaNoAsaas(asaasSubscriptionId: string): Promise<void> {
  await gravar(createAdminClient().from('tenant_subscriptions').update({
    cobranca: 'cancelada', cancelada_em: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('asaas_subscription_id', asaasSubscriptionId).neq('cobranca', 'cancelada'), 'marcar a assinatura encerrada no Asaas')
}

/** Os dados da rede mudaram: o cliente no Asaas acompanha (se existe). */
export async function levarDadosAoAsaas(tenantId: string): Promise<void> {
  const a = await lerAssinatura(tenantId)
  if (!a?.assinatura?.asaasCustomerId) return
  await atualizarCliente(a.assinatura.asaasCustomerId, {
    nome: a.rede.nome, documento: a.rede.documento, email: a.rede.email, telefone: a.rede.telefone,
  })
}

/** Encerra a cobrança no Asaas (as cobranças em aberto somem lá). */
export async function encerrarCobranca(tenantId: string): Promise<void> {
  const a = await lerAssinatura(tenantId)
  if (a?.assinatura?.asaasSubscriptionId && a.assinatura.cobranca === 'ativa') {
    await removerAssinatura(a.assinatura.asaasSubscriptionId)
  }
  await gravar(createAdminClient().from('tenant_subscriptions').update({
    cobranca: 'cancelada', cancelada_em: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).select('tenant_id'), 'marcar a cobrança como cancelada')
}

/** Reconcilia as faturas com o Asaas (o botão do admin e a reserva do cron). */
export async function sincronizarCobranca(tenantId: string, expirar: Expirar): Promise<number> {
  const a = await lerAssinatura(tenantId)
  if (!a?.assinatura?.asaasSubscriptionId) throw new Error('A rede não tem cobrança no Asaas.')
  const cobrancas = await cobrancasDaAssinatura(a.assinatura.asaasSubscriptionId)
  for (const c of cobrancas) {
    await aplicarCobranca({ ...c, subscription: c.subscription ?? a.assinatura.asaasSubscriptionId }, 'SINCRONIZACAO', expirar)
  }
  return cobrancas.length
}
