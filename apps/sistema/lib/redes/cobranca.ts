import 'server-only'
import { createAdminClient } from '@estetica-os/nucleo/lib/supabase/admin'
import { gravar, ler, tentar } from '@estetica-os/nucleo/lib/db'
import {
  garantirCliente, criarAssinatura, atualizarValorDaAssinatura, removerAssinatura, cobrancasDaAssinatura, atualizarCliente,
  type CobrancaDoAsaas,
} from '@/lib/asaas/cliente'
import { depoisDaMudanca, lerAssinatura, registrarAutomatico, type AssinaturaLida, type Expirar } from '@estetica-os/nucleo/lib/redes/assinatura'
import { pendentesNoAsaas, type AdicionaisContratados } from '@estetica-os/nucleo/lib/planos/adicionais'

/**
 * A COBRANÇA da assinatura de uma rede — o que fala com o Asaas. Só a
 * administração do sistema (o /sistema, o webhook do Asaas e o cron
 * `assinaturas`) carrega este arquivo. A leitura e o "depois da mudança"
 * moram em `lib/redes/assinatura.ts`.
 */

/** "BellarisOS — plano Pro + 2 conexões de WhatsApp + Copilot": o que a fatura diz que cobra. */
function descricaoDaAssinatura(planoNome: string | null, adicionais: AdicionaisContratados = {}): string {
  const extras: string[] = []
  const w = adicionais.whatsapp?.quantidade ?? 0
  if (w) extras.push(w === 1 ? '1 conexão de WhatsApp' : `${w} conexões de WhatsApp`)
  if (adicionais.copilot) extras.push('Copilot')
  return `BellarisOS${planoNome ? ` — plano ${planoNome}` : ''}${extras.map(e => ` + ${e}`).join('')}`
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
  if (a.assinatura.totalCentavos <= 0) throw new Error('A assinatura está com valor zero.')
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
  // O TOTAL (plano + adicionais), e anotado como levado.
  const sub = await criarAssinatura({
    cliente, valorCentavos: a.assinatura.totalCentavos, vencimento: primeiroVencimento,
    descricao: descricaoDaAssinatura(plano?.nome ?? null, a.assinatura.adicionais), redeId: tenantId,
  })
  await gravar(admin.from('tenant_subscriptions').update({
    asaas_subscription_id: sub.id, cobranca: 'ativa', cancelada_em: null, proximo_vencimento: primeiroVencimento,
    valor_no_asaas_centavos: a.assinatura.totalCentavos,
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).select('tenant_id').single(), 'guardar a assinatura do Asaas')
}

/**
 * Leva ao Asaas o valor novo da assinatura — o TOTAL, plano + adicionais —
 * quando a cobrança está ligada, e anota o que levou
 * (`valor_no_asaas_centavos`). Falhou: a anotação fica velha, e o cron do
 * sistema tenta de novo (`levarValoresPendentes`). Chamado pelo sistema e, a
 * pedido da clínica, por `/api/interno/levar-valor`.
 */
export async function levarValorAoAsaas(tenantId: string): Promise<void> {
  // Duas levadas ao mesmo tempo (a clínica e o admin, ou o cron) podem chegar
  // ao Asaas fora de ordem: a de valor VELHO por último. Por isso, depois de
  // levar, relê o total — mudou no meio, leva de novo — e só anota o valor
  // levado se o total ainda for ele (um update condicional).
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const a = await lerAssinatura(tenantId)
    if (!a?.assinatura?.asaasSubscriptionId || a.assinatura.cobranca !== 'ativa') return
    const plano = a.assinatura.planoId
      ? await ler(createAdminClient().from('platform_plans').select('nome').eq('id', a.assinatura.planoId).maybeSingle(), 'ler o plano') as { nome: string } | null
      : null
    const total = a.assinatura.totalCentavos
    await atualizarValorDaAssinatura(a.assinatura.asaasSubscriptionId, total, descricaoDaAssinatura(plano?.nome ?? null, a.assinatura.adicionais))
    const anotada = await gravar(createAdminClient().from('tenant_subscriptions').update({ valor_no_asaas_centavos: total })
      .eq('tenant_id', tenantId).eq('valor_total_centavos', total).select('tenant_id'), 'anotar o valor levado ao Asaas') as unknown[] | null
    if ((anotada ?? []).length) return
  }
  // Três voltas e o total ainda mudando: fica pendente, e o cron leva.
  console.error('[cobranca] o total mudou durante a levada ao Asaas; fica para o cron:', tenantId)
}

/**
 * A reserva do cron: as assinaturas ligadas cujo total mudou e não chegou ao
 * Asaas (o pedido da clínica que falhou, o Asaas fora do ar). Devolve quantas
 * levou; a que falha de novo fica para a próxima passagem.
 */
export async function levarValoresPendentes(): Promise<number> {
  const ligadas = await ler(createAdminClient().from('tenant_subscriptions')
    .select('tenant_id, valor_total_centavos, valor_no_asaas_centavos')
    .eq('cobranca', 'ativa').not('asaas_subscription_id', 'is', null), 'buscar as assinaturas ligadas') as
    { tenant_id: string; valor_total_centavos: number; valor_no_asaas_centavos: number | null }[] | null
  let levadas = 0
  for (const tenantId of pendentesNoAsaas(ligadas ?? [])) {
    try { await levarValorAoAsaas(tenantId); levadas++ } catch (e) {
      console.error('[cobranca] levar o valor pendente:', tenantId, (e as Error).message)
    }
  }
  return levadas
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
